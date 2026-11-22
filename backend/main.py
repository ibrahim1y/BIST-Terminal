from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
# Önbellek için threading ve time eklendi.
import threading
import time
import yfinance as yf
# Portföy analizi endpoint'i için eklendi.
from typing import Any
import pandas as pd
import sirket_bilgileri as sirket_listesi
from portfoy_analiz import gun_ozeti, hisse_tablosu
from portfoy_analiz import DONEM_SIKLIKLARI, FiyatVerisiHatasi, IslemHatasi, portfoy_analizi, portfoy_donem_kari, portfoy_gun_ici_analizi, kapanis_kolonu, seans_tablosu

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#BIST100 listesi, 1 Ekim - 31 Aralık 2026 dönemi. Liste her çeyrek değişebilir.
# Bu liste yalnızca ilk açılış içindir. Güncel üyeler KAP'tan günde bir alınıp bist100.json dosyasından okunur.
BIST_HISSELER = [
    "AEFES", "AGHOL", "AHGAZ", "AKBNK", "AKCNS", "AKFYE", "AKSA", "AKSEN", "ALARK", "ALBRK",
    "ALTNY", "ANHYT", "ANSGR", "ARCLK", "ASELS", "ASTOR", "AYGAZ", "BERA", "BIMAS", "BINHO",
    "BRSAN", "BRYAT", "BTCIM", "CANTE", "CCOLA", "CIMSA", "CVKMD", "CWENE", "DOAS", "DOHOL",
    "ECILC", "ECZYT", "EGEEN", "EGGUB", "EKGYO", "ENERY", "ENJSA", "ENKAI", "ENTRA", "EREGL",
    "EUREN", "FENER", "FROTO", "GARAN", "GLRMK", "GLYHO", "GRSEL", "GUBRF", "GWIND", "HALKB",
    "HEKTS", "ISCTR", "ISDMR", "ISMEN", "KARSN", "KATMR", "KCAER", "KCHOL", "KORDS", "KRDMD",
    "LMKDC", "MAVI", "MGROS", "MPARK", "OBAMS", "ODAS", "OTKAR", "OYAKC", "PAHOL", "PETKM",
    "PGSUS", "RGYAS", "RYSAS", "SAHOL", "SASA", "SISE", "SNGYO", "SOKM", "TABGD", "TAVHL",
    "TCELL", "TCKRC", "THYAO", "TKFEN", "TOASO", "TRALT", "TRENJ", "TRGYO", "TRMET", "TSKB",
    "TTKOM", "TTRAK", "TUKAS", "TUPRS", "TURSG", "ULKER", "VAKBN", "VESTL", "YKBNK", "ZOREN"
]

# Şirket adları İş Yatırım'ın hisse listesinden, sektörler KAP'ın sektör sayfasından alınıp sirketler.json dosyasına yazılır.
# BIST 100 listesine yeni hisse eklenince adı ve sektörü açılışta ve günde bir otomatik tamamlanır.
# Endeks listesi de aynı arka plan işinde güncellenir, BIST_HISSELER yerinde değiştirilir.
sirket_bilgileri = sirket_listesi.yukle()
sirket_listesi.arka_planda_guncelle(sirket_bilgileri, BIST_HISSELER)

# Hisse listesi için önbellek süresi ve bellekteki kayıt.
HISSELER_CACHE_SURESI = 30  # saniye
hisseler_cache = {"zaman": 0.0, "veri": []}
hisseler_kilit = threading.Lock()

# Yahoo'dan veri çeken kısım ayrı fonksiyona alındı.
def hisseleri_cek():
    # Liste arka planda değişebileceği için bir kopyası üzerinden çalışılır.
    semboller = list(BIST_HISSELER)
    tickers = " ".join([f"{h}.IS" for h in semboller])
    # Günlük veri yerine saatlik veri kullanılır, seçili güne denk gelen eksik satır değişimi bozmaz.
    # Günlük kapanış önceliklidir, seans sonu fiyatını doğru verir.
    saatlik = yf.download(tickers, period="5d", interval="1h", auto_adjust=False, progress=False)
    gunluk = yf.download(tickers, period="5d", interval="1d", auto_adjust=False, progress=False)
    seanslar = seans_tablosu(kapanis_kolonu(saatlik), kapanis_kolonu(gunluk))
    
    hisseler_listesi = []
    for i, sembol in enumerate(semboller):
        sembol_is = f"{sembol}.IS"
        try:
            kapanislar = seanslar[sembol_is].dropna()
            
            if len(kapanislar) >= 2:
                son_fiyat = float(kapanislar.iloc[-1])
                onceki_fiyat = float(kapanislar.iloc[-2])
                
                degisim = 0.0
                if onceki_fiyat > 0:
                    degisim = round(((son_fiyat - onceki_fiyat) / onceki_fiyat) * 100, 2)
                
                # Piyasa sayfasının özet paneli ve listedeki mini grafik için ek bilgiler.
                saatlik_tablo = hisse_tablosu(saatlik, sembol_is)
                ozet = gun_ozeti(saatlik_tablo, hisse_tablosu(gunluk, sembol_is), kapanislar.index[-1])
                saatlik_kapanislar = saatlik_tablo["Close"].dropna() if "Close" in saatlik_tablo else pd.Series(dtype=float)
                bilgi = sirket_bilgileri.get(sembol, {})
                hisseler_listesi.append({
                    "id": i + 1,
                    "sembol": sembol,
                    "ad": bilgi.get("ad", sembol),
                    "sektor": bilgi.get("sektor", ""),
                    "fiyat": round(son_fiyat, 2),
                    "degisim": degisim,
                    "onceki_kapanis": round(onceki_fiyat, 2),
                    "acilis": None if ozet["acilis"] is None else round(ozet["acilis"], 2),
                    "gun_yuksek": None if ozet["yuksek"] is None else round(ozet["yuksek"], 2),
                    "gun_dusuk": None if ozet["dusuk"] is None else round(ozet["dusuk"], 2),
                    "hacim": None if ozet["hacim"] is None else int(ozet["hacim"]),
                    "gecmis": [round(float(f), 2) for f in saatlik_kapanislar.tail(40)] + [round(son_fiyat, 2)],
                })
        except Exception as e:
            print(f"HATA - {sembol} verisi işlenemedi: {e}")
            
    return hisseler_listesi

# Süre dolmadıysa önbellekten döner, boş sonuç önbelleğe alınmaz.
@app.get("/api/hisseler")
def get_hisseler():
    with hisseler_kilit:
        if hisseler_cache["veri"] and time.monotonic() - hisseler_cache["zaman"] < HISSELER_CACHE_SURESI:
            return hisseler_cache["veri"]

        veri = hisseleri_cek()
        if veri:
            hisseler_cache["veri"] = veri
            hisseler_cache["zaman"] = time.monotonic()
        return veri

# Her dönem için yfinance'den istenecek aralık ve mum sıklığı.
GRAFIK_DONEMLERI = {
    "1g": ("1d", "5m"),
    "1h": ("5d", "30m"),
    "1a": ("1mo", "1d"),
    "3a": ("3mo", "1d"),
    "1y": ("1y", "1d"),
    "5y": ("5y", "1wk"),
}

@app.get("/api/grafik/{sembol}")
def get_grafik(sembol: str, donem: str = "3a"):
    #Tanımsız dönem reddedilir.
    if donem not in GRAFIK_DONEMLERI:
        raise HTTPException(status_code=400, detail="Geçersiz dönem")

    aralik, siklik = GRAFIK_DONEMLERI[donem]
    gun_ici = siklik.endswith("m")

    try:
        ticker = yf.Ticker(f"{sembol}.IS")
        hist = ticker.history(period=aralik, interval=siklik).dropna()

        grafik_verisi = []
        for index, row in hist.iterrows():
            grafik_verisi.append({
                #Gün içi veride saat, grafikte İstanbul saatini kullan.
                "time": int(index.timestamp() + index.utcoffset().total_seconds()) if gun_ici else index.strftime("%Y-%m-%d"),
                "open": round(float(row['Open']), 2),
                "high": round(float(row['High']), 2),
                "low": round(float(row['Low']), 2),
                "close": round(float(row['Close']), 2),
                # Hacim çubukları için.
                "volume": int(row['Volume']) if row['Volume'] == row['Volume'] else 0,
            })
        return grafik_verisi
    except Exception as e:
        print(f"HATA - {sembol} grafiği çekilemedi: {e}")
        return []

# İşlem geçmişini alır, WAC tabanlı güncel özeti ve günlük zaman serisini döner.
# İşlemler tarayıcıda tutulduğu için istek gövdesinde gönderilir.
@app.post("/api/portfoy-analiz")
def post_portfoy_analiz(islemler: list[dict[str, Any]]):
    try:
        return portfoy_analizi(islemler)
    except IslemHatasi as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FiyatVerisiHatasi as e:
        print(f"HATA - portföy analizi fiyatları çekilemedi: {e}")
        raise HTTPException(status_code=503, detail="Fiyat verisi alınamadı")


# donem parametresiyle 1G-1Y arası dönemler gün içi sıklıkta döner.
@app.post("/api/portfoy-analiz/gun-ici")
def post_portfoy_gun_ici_analiz(islemler: list[dict[str, Any]], donem: str = "1g"):
    if donem not in DONEM_SIKLIKLARI:
        raise HTTPException(status_code=400, detail="Geçersiz dönem")
    try:
        return portfoy_gun_ici_analizi(islemler, donem)
    except IslemHatasi as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FiyatVerisiHatasi as e:
        print(f"HATA - portföy gün içi fiyatları çekilemedi: {e}")
        raise HTTPException(status_code=503, detail="Fiyat verisi alınamadı")

# Özet şeridindeki 1G-5Y kâr/zararı için elde kalan lotların dönem başı referanslarını döner.
@app.post("/api/portfoy-donem-kari")
def post_portfoy_donem_kari(islemler: list[dict[str, Any]]):
    try:
        return portfoy_donem_kari(islemler)
    except IslemHatasi as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FiyatVerisiHatasi as e:
        print(f"HATA - portföy dönem kârı fiyatları çekilemedi: {e}")
        raise HTTPException(status_code=503, detail="Fiyat verisi alınamadı")

# Üstteki gösterge şeridi: endeksler, döviz ve altın. 30 saniye önbellekli.
GOSTERGELER = [
    ("XU100.IS", "BIST 100", 2),
    ("XU030.IS", "BIST 30", 2),
    ("XBANK.IS", "BIST BANKA", 2),
    ("USDTRY=X", "DOLAR/TL", 4),
    ("EURTRY=X", "EURO/TL", 4),
    ("GC=F", "ONS ALTIN", 2),
]
gostergeler_cache = {"zaman": 0.0, "veri": []}
gostergeler_kilit = threading.Lock()


def gostergeleri_cek():
    kodlar = [kod for kod, _, _ in GOSTERGELER]
    saatlik = yf.download(kodlar, period="5d", interval="1h", auto_adjust=False, progress=False)
    gunluk = yf.download(kodlar, period="5d", interval="1d", auto_adjust=False, progress=False)
    seanslar = seans_tablosu(kapanis_kolonu(saatlik), kapanis_kolonu(gunluk))
    sonuc = []
    for kod, ad, ondalik in GOSTERGELER:
        if kod not in seanslar.columns:
            continue
        fiyatlar = seanslar[kod].dropna()
        if len(fiyatlar) < 2:
            continue
        son, onceki = float(fiyatlar.iloc[-1]), float(fiyatlar.iloc[-2])
        sonuc.append({"ad": ad, "deger": round(son, ondalik), "ondalik": ondalik, "degisim": round((son - onceki) / onceki * 100, 2) if onceki else 0.0})
    return sonuc


@app.get("/api/gostergeler")
def get_gostergeler():
    with gostergeler_kilit:
        if gostergeler_cache["veri"] and time.monotonic() - gostergeler_cache["zaman"] < HISSELER_CACHE_SURESI:
            return gostergeler_cache["veri"]
        try:
            veri = gostergeleri_cek()
        except Exception as e:
            print(f"HATA - göstergeler çekilemedi: {e}")
            veri = []
        if veri:
            gostergeler_cache["veri"] = veri
            gostergeler_cache["zaman"] = time.monotonic()
        return veri
