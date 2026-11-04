# Ağırlıklı ortalama maliyet (WAC) ve gerçekleşen/açık kâr hesabı yapan modül.
# Hesap kısmı internete çıkmaz, bu yüzden yfinance olmadan da test edilebilir.
from bisect import bisect_left
from dataclasses import dataclass
import math
import re
from typing import Any

import pandas as pd
import yfinance as yf

BIST_TICKER = re.compile(r"^[A-Z0-9]+\.IS$")
LOT_TOLERANSI = 1e-9
# İlk işlem tatile denk gelirse önceki kapanış ileri taşınabilsin diye geriye doğru pay bırakılır.
FIYAT_PAYI_GUN = 15


class IslemHatasi(ValueError):
    """İşlem kaydının biçimi bozuk."""


class FiyatVerisiHatasi(RuntimeError):
    """Hiçbir hissenin geçmiş fiyatı alınamadı."""


@dataclass(frozen=True)
class Islem:
    zaman: pd.Timestamp
    ticker: str
    tip: str
    lot: float
    fiyat: float


@dataclass
class Pozisyon:
    lot: float = 0.0
    wac: float = 0.0
    son_islem_fiyati: float = 0.0


def _pozitif_sayi(deger: Any, alan: str) -> float:
    try:
        sayi = float(deger)
    except (TypeError, ValueError):
        raise IslemHatasi(f"{alan} sayı olmalıdır: {deger!r}") from None
    if not math.isfinite(sayi) or sayi <= 0:
        raise IslemHatasi(f"{alan} pozitif olmalıdır: {deger!r}")
    return sayi


def _zaman_coz(deger: Any) -> pd.Timestamp:
    try:
        zaman = pd.Timestamp(deger)
    except (TypeError, ValueError):
        raise IslemHatasi(f"Geçersiz tarih: {deger!r}") from None
    if pd.isna(zaman):
        raise IslemHatasi(f"Geçersiz tarih: {deger!r}")
    return zaman.tz_localize(None) if zaman.tzinfo is not None else zaman


def islemleri_coz(kayitlar: list[dict[str, Any]]) -> list[Islem]:
    """Kayıtları doğrular ve zamana göre sıralar.

    Python'un sıralaması kararlıdır: zamanı aynı olan işlemler gönderildiği sırada kalır.
    Böylece aynı gün yapılan "önce alış, sonra satış" sırası bozulmaz.
    """
    islemler = []
    for kayit in kayitlar:
        ticker = kayit.get("ticker")
        tip = kayit.get("type")
        if not isinstance(ticker, str) or not BIST_TICKER.match(ticker):
            raise IslemHatasi(f"Geçersiz hisse: {ticker!r}")
        if tip not in ("BUY", "SELL"):
            raise IslemHatasi(f"Geçersiz işlem tipi: {tip!r}")
        islemler.append(Islem(
            zaman=_zaman_coz(kayit.get("date")),
            ticker=ticker,
            tip=tip,
            lot=_pozitif_sayi(kayit.get("quantity"), "Lot"),
            fiyat=_pozitif_sayi(kayit.get("price"), "Fiyat"),
        ))
    return sorted(islemler, key=lambda islem: islem.zaman)


def kapanislari_cek(tickers: list[str], baslangic: pd.Timestamp, bitis: pd.Timestamp) -> pd.DataFrame:
    """Günlük kapanışları satır=tarih, kolon=hisse biçiminde döner."""
    # auto_adjust=False: işlem fiyatlarıyla karşılaştırılacağı için temettü düzeltmesi yapılmamış kapanış kullanılır.
    veri = yf.download(
        tickers,
        start=(baslangic - pd.Timedelta(days=FIYAT_PAYI_GUN)).strftime("%Y-%m-%d"),
        end=(bitis + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
        interval="1d",
        auto_adjust=False,
        progress=False,
    )
    if veri.empty:
        return pd.DataFrame()

    kapanislar = veri["Close"]
    if isinstance(kapanislar, pd.Series):
        kapanislar = kapanislar.to_frame(tickers[0])
    kapanislar = kapanislar.dropna(axis=1, how="all")

    index = pd.DatetimeIndex(kapanislar.index)
    kapanislar.index = (index.tz_localize(None) if index.tz is not None else index).normalize()
    return kapanislar[~kapanislar.index.duplicated(keep="last")]


def _tl(tutar: float) -> float:
    # + 0.0, yuvarlamadan çıkabilecek -0.0 değerini 0.0 yapar.
    return round(tutar, 2) + 0.0


def gunluk_seri_olustur(
    islemler: list[Islem],
    kapanislar: pd.DataFrame,
    bitis: pd.Timestamp,
) -> dict[str, Any]:
    """İlk işlemden bitiş gününe kadar her takvim günü için metrikleri hesaplar."""
    takvim = pd.date_range(
        islemler[0].zaman.normalize(),
        max(bitis.normalize(), islemler[-1].zaman.normalize()),
        freq="D",
    )

    # Hafta sonu ve tatillerde son kapanış ileri taşınır (ffill).
    if kapanislar.empty:
        fiyatlar = pd.DataFrame(index=takvim)
    else:
        fiyatlar = kapanislar.reindex(kapanislar.index.union(takvim)).sort_index().ffill().reindex(takvim)
    fiyat_kolonlari = {ticker: fiyatlar[ticker].to_numpy() for ticker in fiyatlar.columns}

    pozisyonlar: dict[str, Pozisyon] = {}
    gerceklesen_kar = 0.0
    reddedilen_satislar = []
    eksik_fiyatlar = set()
    seri = []
    sira = 0
    son_fiyatlar: dict[str, float] = {}

    for gun_no, gun in enumerate(takvim):
        # Pozisyonlar yalnızca işlem olunca değişir; diğer günlerde önceki günden aynen taşınır.
        while sira < len(islemler) and islemler[sira].zaman.normalize() == gun:
            islem = islemler[sira]
            sira += 1
            pozisyon = pozisyonlar.setdefault(islem.ticker, Pozisyon())

            if islem.tip == "BUY":
                # Yeni WAC = ((Eski Lot * Eski WAC) + (Alınan Lot * Alış Fiyatı)) / (Eski Lot + Alınan Lot)
                # Payda sıfır olamaz: alınan lot doğrulamada pozitif olmak zorundadır.
                yeni_lot = pozisyon.lot + islem.lot
                pozisyon.wac = ((pozisyon.lot * pozisyon.wac) + (islem.lot * islem.fiyat)) / yeni_lot
                pozisyon.lot = yeni_lot
            else:
                # Açığa satış engeli: eldeki lottan fazlası satılamaz, işlem uygulanmadan raporlanır.
                if islem.lot > pozisyon.lot + LOT_TOLERANSI:
                    reddedilen_satislar.append({
                        "date": islem.zaman.strftime("%Y-%m-%d"),
                        "ticker": islem.ticker,
                        "quantity": islem.lot,
                        "available": pozisyon.lot,
                    })
                    continue
                # Satış WAC'ı değiştirmez, yalnızca lotu düşürür ve kârı ayrıştırır.
                # Realized PnL += Satılan Lot * (Satış Fiyatı - Mevcut WAC)
                gerceklesen_kar += islem.lot * (islem.fiyat - pozisyon.wac)
                pozisyon.lot -= islem.lot
                # Kalan lot 0 ise WAC 0.0 olur; maliyet hiçbir zaman eksiye düşmez.
                if pozisyon.lot <= LOT_TOLERANSI:
                    pozisyon.lot = 0.0
                    pozisyon.wac = 0.0

            pozisyon.son_islem_fiyati = islem.fiyat

        # Total Invested = Σ (Lot_t * WAC_t), Portfolio Value = Σ (Lot_t * Kapanış_t)
        toplam_maliyet = 0.0
        piyasa_degeri = 0.0
        for ticker, pozisyon in pozisyonlar.items():
            if pozisyon.lot == 0:
                continue
            kolon = fiyat_kolonlari.get(ticker)
            fiyat = float(kolon[gun_no]) if kolon is not None else math.nan
            # Kapanış yoksa (yeni halka arz, veri hatası) değer 0 sayılıp sahte zarar yazılmasın diye işlem fiyatı kullanılır.
            if math.isnan(fiyat):
                fiyat = pozisyon.son_islem_fiyati
                eksik_fiyatlar.add(ticker)
            son_fiyatlar[ticker] = fiyat
            toplam_maliyet += pozisyon.lot * pozisyon.wac
            piyasa_degeri += pozisyon.lot * fiyat

        acik_kar = piyasa_degeri - toplam_maliyet
        # Sıfıra bölme engeli: elde hisse yoksa getiri 0.0 kabul edilir.
        acik_getiri = (acik_kar / toplam_maliyet) * 100 if toplam_maliyet > 0 else 0.0

        seri.append({
            "date": gun.strftime("%Y-%m-%d"),
            "portfolio_value": _tl(piyasa_degeri),
            "total_invested": _tl(toplam_maliyet),
            "unrealized_pnl": _tl(acik_kar),
            "unrealized_return_pct": _tl(acik_getiri),
            "realized_pnl": _tl(gerceklesen_kar),
        })

    return {
        "summary": seri[-1],
        "positions": [
            {
                "ticker": ticker,
                "lots": pozisyon.lot,
                "wac": round(pozisyon.wac, 4),
                "last_price": _tl(son_fiyatlar[ticker]),
            }
            for ticker, pozisyon in sorted(pozisyonlar.items())
            if pozisyon.lot > 0
        ],
        "series": seri,
        "warnings": {
            "rejected_sales": reddedilen_satislar,
            "missing_prices": sorted(eksik_fiyatlar),
        },
    }


def portfoy_analizi(kayitlar: list[dict[str, Any]]) -> dict[str, Any]:
    """İşlem geçmişinden güncel durumu ve günlük zaman serisini üretir."""
    islemler = islemleri_coz(kayitlar)
    if not islemler:
        return {
            "summary": None,
            "positions": [],
            "series": [],
            "warnings": {"rejected_sales": [], "missing_prices": []},
        }

    bugun = pd.Timestamp.now(tz="Europe/Istanbul").tz_localize(None).normalize()
    tickers = sorted({islem.ticker for islem in islemler})
    try:
        kapanislar = kapanislari_cek(tickers, islemler[0].zaman.normalize(), bugun)
    except Exception as e:
        raise FiyatVerisiHatasi(str(e)) from e
    if kapanislar.empty:
        raise FiyatVerisiHatasi("Yahoo Finance boş sonuç döndürdü")

    return gunluk_seri_olustur(islemler, kapanislar, bugun)


# 1G görünümü için gün içi seri. Hisse grafiğindeki 1G ile aynı aralık ve sıklık kullanılır.
GUN_ICI_ARALIK = pd.Timedelta(minutes=5)


def gun_ici_fiyatlari_cek(tickers: list[str]) -> pd.DataFrame:
    """Son seansın 5 dakikalık kapanışlarını İstanbul saatiyle döner."""
    veri = yf.download(tickers, period="1d", interval="5m", auto_adjust=False, progress=False)
    if veri.empty:
        return pd.DataFrame()

    fiyatlar = veri["Close"]
    if isinstance(fiyatlar, pd.Series):
        fiyatlar = fiyatlar.to_frame(tickers[0])
    fiyatlar = fiyatlar.dropna(axis=1, how="all")

    index = pd.DatetimeIndex(fiyatlar.index)
    fiyatlar.index = index.tz_convert("Europe/Istanbul").tz_localize(None) if index.tz is not None else index
    return fiyatlar


def gun_ici_seri_olustur(islemler: list[Islem], fiyatlar: pd.DataFrame) -> dict[str, Any]:
    """Her 5 dakikalık mum için o ana kadarki işlemlerle metrikleri hesaplar.

    WAC ve gerçekleşen kâr, günlük hesapla aynı kalsın diye gunluk_seri_olustur ile bulunur.
    Fiyatsız çağrıda oradaki last_price son işlem fiyatıdır; fiyatı hiç alınamayan hisse için bu değer kullanılır.
    """
    # Seans başında henüz işlem görmemiş hisse, değeri 0 sayılmasın diye seansın ilk fiyatıyla başlar.
    fiyatlar = fiyatlar.sort_index().ffill().bfill()
    zamanlar = [islem.zaman for islem in islemler]
    durumlar: dict[int, dict[str, Any]] = {}
    eksik_fiyatlar = set()

    def durum_bul(islem_sayisi: int) -> dict[str, Any]:
        # Durum yalnızca yeni işlem gelince değişir, bu yüzden her işlem sayısı için bir kez hesaplanır.
        if islem_sayisi not in durumlar:
            alt_liste = islemler[:islem_sayisi]
            durumlar[islem_sayisi] = gunluk_seri_olustur(alt_liste, pd.DataFrame(), alt_liste[-1].zaman)
        return durumlar[islem_sayisi]

    def nokta_olustur(zaman: pd.Timestamp, islem_sayisi: int, satir: pd.Series) -> dict[str, Any]:
        durum = durum_bul(islem_sayisi)
        piyasa_degeri = 0.0
        for pozisyon in durum["positions"]:
            fiyat = satir.get(pozisyon["ticker"], math.nan)
            if math.isnan(fiyat):
                fiyat = pozisyon["last_price"]
                eksik_fiyatlar.add(pozisyon["ticker"])
            piyasa_degeri += pozisyon["lots"] * fiyat

        toplam_maliyet = durum["summary"]["total_invested"]
        acik_kar = piyasa_degeri - toplam_maliyet
        return {
            "date": zaman.strftime("%Y-%m-%dT%H:%M:%S"),
            "portfolio_value": _tl(piyasa_degeri),
            "total_invested": toplam_maliyet,
            "unrealized_pnl": _tl(acik_kar),
            "unrealized_return_pct": _tl((acik_kar / toplam_maliyet) * 100 if toplam_maliyet > 0 else 0.0),
            "realized_pnl": durum["summary"]["realized_pnl"],
        }

    seri = []
    for zaman, satir in fiyatlar.iterrows():
        # Mum içinde yapılan işlem o mumdan itibaren sayılır. İlk işlemden önceki mumlar seriye girmez.
        islem_sayisi = bisect_left(zamanlar, zaman + GUN_ICI_ARALIK)
        if islem_sayisi > 0:
            seri.append(nokta_olustur(zaman, islem_sayisi, satir))

    # Seans kapandıktan sonra yapılan işlemler son mumda sayılmadığı için ayrı bir son nokta eklenir.
    son_satir = fiyatlar.iloc[-1]
    if not seri or bisect_left(zamanlar, fiyatlar.index[-1] + GUN_ICI_ARALIK) < len(islemler):
        seri.append(nokta_olustur(zamanlar[-1], len(islemler), son_satir))

    son_durum = durum_bul(len(islemler))
    return {
        "summary": seri[-1],
        "positions": [
            {
                **pozisyon,
                "last_price": _tl(pozisyon["last_price"] if math.isnan(son_satir.get(pozisyon["ticker"], math.nan)) else son_satir[pozisyon["ticker"]]),
            }
            for pozisyon in son_durum["positions"]
        ],
        "series": seri,
        "warnings": {
            "rejected_sales": son_durum["warnings"]["rejected_sales"],
            "missing_prices": sorted(eksik_fiyatlar),
        },
    }


def portfoy_gun_ici_analizi(kayitlar: list[dict[str, Any]]) -> dict[str, Any]:
    """portfoy_analizi ile aynı biçimde, seri olarak son seansın 5 dakikalık noktalarını döner."""
    islemler = islemleri_coz(kayitlar)
    if not islemler:
        return portfoy_analizi([])

    try:
        fiyatlar = gun_ici_fiyatlari_cek(sorted({islem.ticker for islem in islemler}))
    except Exception as e:
        raise FiyatVerisiHatasi(str(e)) from e
    if fiyatlar.empty:
        raise FiyatVerisiHatasi("Yahoo Finance boş sonuç döndürdü")

    return gun_ici_seri_olustur(islemler, fiyatlar)
