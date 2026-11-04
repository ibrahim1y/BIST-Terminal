from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
# Önbellek için threading ve time eklendi.
import threading
import time
import yfinance as yf
# Portföy analizi endpoint'i için eklendi.
from typing import Any
from portfoy_analiz import FiyatVerisiHatasi, IslemHatasi, portfoy_analizi, portfoy_gun_ici_analizi

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#BIST100 listesi, 1 Ekim - 31 Aralık 2026 dönemi. Liste her çeyrek değişebilir.
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

# Hisse listesi için önbellek süresi ve bellekteki kayıt.
HISSELER_CACHE_SURESI = 30  # saniye
hisseler_cache = {"zaman": 0.0, "veri": []}
hisseler_kilit = threading.Lock()

# Yahoo'dan veri çeken kısım ayrı fonksiyona alındı.
def hisseleri_cek():
    tickers = " ".join([f"{h}.IS" for h in BIST_HISSELER])
    data = yf.download(tickers, period="5d", progress=False)
    
    hisseler_listesi = []
    for i, sembol in enumerate(BIST_HISSELER):
        sembol_is = f"{sembol}.IS"
        try:
            kapanislar = data['Close'][sembol_is].dropna()
            
            if len(kapanislar) >= 2:
                son_fiyat = float(kapanislar.iloc[-1])
                onceki_fiyat = float(kapanislar.iloc[-2])
                
                degisim = 0.0
                if onceki_fiyat > 0:
                    degisim = round(((son_fiyat - onceki_fiyat) / onceki_fiyat) * 100, 2)
                
                hisseler_listesi.append({
                    "id": i + 1,
                    "sembol": sembol,
                    "ad": sembol,
                    "fiyat": round(son_fiyat, 2),
                    "degisim": degisim,
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
                "close": round(float(row['Close']), 2)
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


#Portföy grafiğinin 1G görünümü için son seansın 5 dakikalık serisini döner.
@app.post("/api/portfoy-analiz/gun-ici")
def post_portfoy_gun_ici_analiz(islemler: list[dict[str, Any]]):
    try:
        return portfoy_gun_ici_analizi(islemler)
    except IslemHatasi as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FiyatVerisiHatasi as e:
        print(f"HATA - portföy gün içi fiyatları çekilemedi: {e}")
        raise HTTPException(status_code=503, detail="Fiyat verisi alınamadı")
