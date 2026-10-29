from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BIST_HISSELER = [
    "AKBNK", "ALARK", "ASELS", "ASTOR", "BIMAS", "BRSAN",
    "DOAS", "EKGYO", "ENKAI", "EREGL", "FROTO", "GARAN", "GUBRF",
    "HEKTS", "ISCTR", "KCHOL", "KRDMD", "ODAS",
    "PETKM", "PGSUS", "SAHOL", "SASA", "SISE", "TCELL", "THYAO",
    "TOASO", "TUPRS", "YKBNK"
]

@app.get("/api/hisseler")
def get_hisseler():
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
                    "hacim": "Canlı"
                })
        except Exception as e:
            continue
            
    return hisseler_listesi

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