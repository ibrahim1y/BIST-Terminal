from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# Önbellek için threading ve time eklendi.
import threading
import time
import yfinance as yf

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

@app.get("/api/grafik/{sembol}")
def get_grafik(sembol: str):
    try:
        ticker = yf.Ticker(f"{sembol}.IS")
        hist = ticker.history(period="3mo").dropna() 
        
        grafik_verisi = []
        for index, row in hist.iterrows():
            grafik_verisi.append({
                "time": index.strftime("%Y-%m-%d"),
                "open": round(float(row['Open']), 2),
                "high": round(float(row['High']), 2),
                "low": round(float(row['Low']), 2),
                "close": round(float(row['Close']), 2)
            })
        return grafik_verisi
    except Exception as e:
        print(f"HATA - {sembol} grafiği çekilemedi: {e}")
        return []