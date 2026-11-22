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


# Yahoo'nun günlük verisinde bazen bir gün eksik geliyor ve değişim yanlış güne göre hesaplanıyordu.
# Bu yüzden günlük kapanış, saatlik verideki her seansın son fiyatından çıkarılır.
def seans_kapanislari(saatlik_kapanislar: pd.DataFrame) -> pd.DataFrame:
    """Saatlik fiyatlardan satır=seans günü, kolon=hisse olan son fiyat tablosu üretir."""
    index = pd.DatetimeIndex(saatlik_kapanislar.index)
    gunler = (index.tz_convert("Europe/Istanbul").tz_localize(None) if index.tz is not None else index).normalize()
    return saatlik_kapanislar.groupby(gunler).last()


# Saatlik veri seans sonundaki kapanışı içermez, günlük veri ise bazen bir günü atlar.
# Bu yüzden günlük kapanış önceliklidir, eksik günler ve boş fiyatlar saatlik veriyle tamamlanır.
def seans_tablosu(saatlik_kapanislar: pd.DataFrame, gunluk_kapanislar: pd.DataFrame) -> pd.DataFrame:
    """Satır=seans günü, kolon=hisse olan birleşik kapanış tablosu üretir."""
    saatlik = seans_kapanislari(saatlik_kapanislar) if not saatlik_kapanislar.empty else pd.DataFrame()
    gunluk = gunluk_kapanislar
    if not gunluk.empty:
        index = pd.DatetimeIndex(gunluk.index)
        gunluk = gunluk.set_axis((index.tz_localize(None) if index.tz is not None else index).normalize())
    return gunluk.combine_first(saatlik).sort_index().dropna(how="all")


def kapanis_kolonu(veri: pd.DataFrame) -> pd.DataFrame:
    return veri["Close"] if not veri.empty else pd.DataFrame()


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

    sonuc = gunluk_seri_olustur(islemler, kapanislar, bugun)
    kalanlar = elde_kalan_islemler(islemler)
    return elde_kalan_seriyi_ekle(sonuc, gunluk_seri_olustur(kalanlar, kapanislar, bugun)["series"] if kalanlar else [])


# Gün içi serinin varsayılan nokta süresi.
GUN_ICI_ARALIK = pd.Timedelta(minutes=5)


# Portföy grafiği 5Y dışındaki dönemlerde gün içi veriyle çizilir. 1G iki dakikalık, 1H-1Y saatlik.
# Saatlik veri seans sonu kapanışını içermediği için her güne 18:10'da günlük kapanış noktası eklenir.
DONEM_SIKLIKLARI = {
    "1g": ("2m", pd.Timedelta(minutes=2), None),
    "1h": ("1h", pd.Timedelta(hours=1), 7),
    "1a": ("1h", pd.Timedelta(hours=1), 30),
    "3a": ("1h", pd.Timedelta(hours=1), 90),
    "1y": ("1h", pd.Timedelta(hours=1), 365),
}
KAPANIS_SAATI = pd.Timedelta(hours=18, minutes=10)
SUREKLI_ISLEM_SONU = pd.Timedelta(hours=18)


def donem_fiyat_tablosu(
    gun_ici_kapanislar: pd.DataFrame,
    gunluk_kapanislar: pd.DataFrame,
    baslangic_zamani: pd.Timestamp,
    mum_suresi: pd.Timedelta = pd.Timedelta(0),
) -> pd.DataFrame:
    """Gün içi fiyatlarla günlük kapanışları tek zaman çizelgesinde birleştirir ve dönem başından keser.

    Dönem başına, o ana kadarki son kapanışla bir nokta eklenir. Böylece grafik üstteki dönem kârıyla aynı yerden başlar.
    """
    parcalar = []
    gun_ici = pd.DataFrame()
    if not gun_ici_kapanislar.empty:
        gun_ici = gun_ici_kapanislar.copy()
        index = pd.DatetimeIndex(gun_ici.index)
        index = index.tz_convert("Europe/Istanbul").tz_localize(None) if index.tz is not None else index
        # Yahoo mumu başlangıç saatiyle etiketler, kapanış fiyatı ise mumun sonundadır.
        # Nokta mumun bittiği ana taşınır, son mum sürekli işlemin bittiği 18:00'i geçmez.
        bitis = index + mum_suresi
        gun_ici.index = bitis.where(bitis <= bitis.normalize() + SUREKLI_ISLEM_SONU, bitis.normalize() + SUREKLI_ISLEM_SONU)
        gun_ici = gun_ici[~gun_ici.index.duplicated(keep="last")]
    if not gunluk_kapanislar.empty:
        gunluk = gunluk_kapanislar.copy()
        gunler = pd.DatetimeIndex(gunluk.index).normalize()
        zamanlar = gunler + KAPANIS_SAATI
        if not gun_ici.empty:
            # Seans sürüyorsa bugünün günlük fiyatı 18:10'a değil, son gün içi noktanın yerine yazılır.
            son_nokta = gun_ici.index.max()
            if son_nokta - son_nokta.normalize() < SUREKLI_ISLEM_SONU:
                zamanlar = zamanlar.where(gunler != son_nokta.normalize(), son_nokta)
        gunluk.index = zamanlar
        parcalar.insert(0, gunluk)
    if not gun_ici.empty:
        parcalar.append(gun_ici)
    if not parcalar:
        return pd.DataFrame()

    # Aynı saatte iki fiyat varsa günlük kapanış önceliklidir.
    fiyatlar = pd.concat(parcalar).sort_index(kind="stable")
    fiyatlar = fiyatlar[~fiyatlar.index.duplicated(keep="first")]
    fiyatlar = fiyatlar.reindex(fiyatlar.index.union([baslangic_zamani])).ffill()
    return fiyatlar.loc[fiyatlar.index >= baslangic_zamani].dropna(how="all")


def donem_fiyatlari_cek(tickers: list[str], donem: str, bugun: pd.Timestamp) -> tuple[pd.DataFrame, pd.Timedelta]:
    """Dönemin fiyat tablosunu ve bir fiyat noktasının kapsadığı süreyi döner."""
    aralik_kodu, mum_suresi, gun = DONEM_SIKLIKLARI[donem]
    gunluk = kapanislari_cek(tickers, bugun - pd.Timedelta(days=gun or 10), bugun)
    seanslar = gunluk.dropna(how="all").index
    if donem == "1g":
        # 1G dönem başı, üstteki dönem kârı gibi önceki seansın kapanışıdır.
        oncekiler = seanslar[seanslar < seanslar[-1]] if len(seanslar) else seanslar
        baslangic = oncekiler[-1] if len(oncekiler) else bugun - pd.Timedelta(days=1)
    else:
        baslangic = bugun - pd.Timedelta(days=gun)

    veri = yf.download(
        tickers,
        start=baslangic.strftime("%Y-%m-%d"),
        end=(bugun + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
        interval=aralik_kodu,
        auto_adjust=False,
        progress=False,
    )
    gun_ici = kapanis_kolonu(veri)
    if isinstance(gun_ici, pd.Series):
        gun_ici = gun_ici.to_frame(tickers[0])
    # Noktalar mumun bitişinde olduğu için bir işlem, noktanın zamanından önce yapıldıysa o noktada sayılır.
    return donem_fiyat_tablosu(gun_ici, gunluk, baslangic + KAPANIS_SAATI, mum_suresi), pd.Timedelta(0)


def gun_ici_seri_olustur(islemler: list[Islem], fiyatlar: pd.DataFrame, aralik: pd.Timedelta = GUN_ICI_ARALIK) -> dict[str, Any]:
    """Her fiyat noktası için o ana kadarki işlemlerle metrikleri hesaplar.

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
        # Mum içinde yapılan işlem o mumdan itibaren sayılır.
        islem_sayisi = bisect_left(zamanlar, zaman + aralik)
        # İlk işlemden önceki noktalar sıfır olarak eklenir. Böylece grafik seçilen dönemin tamamını gösterir.
        seri.append(nokta_olustur(zaman, islem_sayisi, satir) if islem_sayisi > 0 else {
            "date": zaman.strftime("%Y-%m-%dT%H:%M:%S"),
            "portfolio_value": 0.0,
            "total_invested": 0.0,
            "unrealized_pnl": 0.0,
            "unrealized_return_pct": 0.0,
            "realized_pnl": 0.0,
        })

    # Seans kapandıktan sonra yapılan işlemler son mumda sayılmadığı için ayrı bir son nokta eklenir.
    son_satir = fiyatlar.iloc[-1]
    if bisect_left(zamanlar, fiyatlar.index[-1] + aralik) < len(islemler):
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


def portfoy_gun_ici_analizi(kayitlar: list[dict[str, Any]], donem: str = "1g") -> dict[str, Any]:
    """portfoy_analizi ile aynı biçimde, seri olarak seçilen dönemin gün içi noktalarını döner."""
    islemler = islemleri_coz(kayitlar)
    if not islemler:
        return portfoy_analizi([])

    try:
        bugun = pd.Timestamp.now(tz="Europe/Istanbul").tz_localize(None).normalize()
        fiyatlar, aralik = donem_fiyatlari_cek(sorted({islem.ticker for islem in islemler}), donem, bugun)
    except Exception as e:
        raise FiyatVerisiHatasi(str(e)) from e
    if fiyatlar.empty:
        raise FiyatVerisiHatasi("Yahoo Finance boş sonuç döndürdü")

    sonuc = gun_ici_seri_olustur(islemler, fiyatlar, aralik)
    kalanlar = elde_kalan_islemler(islemler)
    return elde_kalan_seriyi_ekle(sonuc, gun_ici_seri_olustur(kalanlar, fiyatlar, aralik)["series"] if kalanlar else [])


# Özet şeridindeki dönem kâr/zararı. Yalnızca hâlâ elde olan lotlar sayılır, satılan lotlar hesaba girmez.
DONEM_GUNLERI = {"1h": 7, "1a": 30, "3a": 90, "1y": 365, "5y": 1825}


def donem_pozisyonlari(
    islemler: list[Islem],
    baslangic: pd.Timestamp,
    kapanislar: pd.DataFrame,
) -> list[dict[str, Any]]:
    """Elde kalan her hisse için dönem başındaki referans tutarı hesaplar.

    Dönem başında elde olan lotun referansı o günkü kapanıştır, dönem içinde alınan lotun referansı alış fiyatıdır.
    Satış en son alınan lottan düşer; böylece satılan lotların kâr veya zararı sonuca karışmaz.
    """
    baslangic = baslangic.normalize()
    eskiler: dict[str, Pozisyon] = {}
    katmanlar: dict[str, list[list[float]]] = {}
    baslangic_kuruldu = False

    def baslangici_kur() -> None:
        for ticker, pozisyon in eskiler.items():
            if pozisyon.lot <= LOT_TOLERANSI:
                continue
            fiyatlar = kapanislar[ticker].loc[:baslangic].dropna() if ticker in kapanislar.columns else pd.Series(dtype=float)
            # Dönem başı fiyatı yoksa kâr uydurmamak için maliyet referans alınır.
            fiyat = float(fiyatlar.iloc[-1]) if len(fiyatlar) else pozisyon.wac
            katmanlar[ticker] = [[pozisyon.lot, fiyat]]

    for islem in islemler:
        if islem.zaman.normalize() <= baslangic:
            pozisyon = eskiler.setdefault(islem.ticker, Pozisyon())
            if islem.tip == "BUY":
                yeni_lot = pozisyon.lot + islem.lot
                pozisyon.wac = ((pozisyon.lot * pozisyon.wac) + (islem.lot * islem.fiyat)) / yeni_lot
                pozisyon.lot = yeni_lot
            elif islem.lot <= pozisyon.lot + LOT_TOLERANSI:
                pozisyon.lot -= islem.lot
            continue

        if not baslangic_kuruldu:
            baslangici_kur()
            baslangic_kuruldu = True

        katman = katmanlar.setdefault(islem.ticker, [])
        if islem.tip == "BUY":
            katman.append([islem.lot, islem.fiyat])
        elif islem.lot <= sum(lot for lot, _ in katman) + LOT_TOLERANSI:
            kalan = islem.lot
            while kalan > LOT_TOLERANSI and katman:
                dusulen = min(katman[-1][0], kalan)
                katman[-1][0] -= dusulen
                kalan -= dusulen
                if katman[-1][0] <= LOT_TOLERANSI:
                    katman.pop()

    if not baslangic_kuruldu:
        baslangici_kur()

    return [
        {
            "ticker": ticker,
            "lots": sum(lot for lot, _ in katman),
            "reference": round(sum(lot * fiyat for lot, fiyat in katman), 4),
        }
        for ticker, katman in sorted(katmanlar.items())
        if katman
    ]


def donem_kari_olustur(
    islemler: list[Islem],
    kapanislar: pd.DataFrame,
    seanslar: pd.DatetimeIndex,
    bugun: pd.Timestamp,
) -> dict[str, list[dict[str, Any]]]:
    """Her dönem için elde kalan pozisyonları döner. 1G dönem başı önceki seansın kapanışıdır."""
    onceki_seans = seanslar[-2] if len(seanslar) >= 2 else bugun - pd.Timedelta(days=1)
    baslangiclar = {"1g": onceki_seans}
    baslangiclar.update({kod: bugun - pd.Timedelta(days=gun) for kod, gun in DONEM_GUNLERI.items()})
    return {kod: donem_pozisyonlari(islemler, baslangic, kapanislar) for kod, baslangic in baslangiclar.items()}


def portfoy_donem_kari(kayitlar: list[dict[str, Any]]) -> dict[str, Any]:
    """Dönem kârı için dönem başı referanslarını ve son fiyatları döner. Fiyat çarpımı canlı fiyatla tarayıcıda yapılır."""
    islemler = islemleri_coz(kayitlar)
    bugun = pd.Timestamp.now(tz="Europe/Istanbul").tz_localize(None).normalize()
    tickers = sorted({p["ticker"] for p in donem_pozisyonlari(islemler, bugun + pd.Timedelta(days=1), pd.DataFrame())})
    if not tickers:
        return {"periods": {kod: [] for kod in ["1g", *DONEM_GUNLERI]}, "last_prices": {}}

    try:
        gunluk = kapanislari_cek(tickers, islemler[0].zaman.normalize(), bugun)
        saatlik = yf.download(tickers, period="5d", interval="1h", auto_adjust=False, progress=False)
    except Exception as e:
        raise FiyatVerisiHatasi(str(e)) from e
    kapanis_saatlik = kapanis_kolonu(saatlik)
    if isinstance(kapanis_saatlik, pd.Series):
        kapanis_saatlik = kapanis_saatlik.to_frame(tickers[0])
    # Yahoo'nun günlük verisinde eksik kalan günler saatlik veriyle tamamlanır.
    kapanislar = seans_tablosu(kapanis_saatlik, gunluk)
    if kapanislar.empty:
        raise FiyatVerisiHatasi("Yahoo Finance boş sonuç döndürdü")

    return {
        "periods": donem_kari_olustur(islemler, kapanislar, kapanislar.index, bugun),
        "last_prices": {
            ticker: round(float(kapanislar[ticker].dropna().iloc[-1]), 2)
            for ticker in kapanislar.columns
            if kapanislar[ticker].notna().any()
        },
    }


# Kâr/Zarar grafiği yalnızca bugün hâlâ elde olan lotları sayar. Satılan lotlar geçmişten de çıkar.
def elde_kalan_islemler(islemler: list[Islem]) -> list[Islem]:
    """Satışları en son alınan lottan düşer ve yalnızca elde kalan alımları döner."""
    katmanlar: dict[str, list[list[Any]]] = {}
    for islem in islemler:
        katman = katmanlar.setdefault(islem.ticker, [])
        if islem.tip == "BUY":
            katman.append([islem.lot, islem])
        elif islem.lot <= sum(lot for lot, _ in katman) + LOT_TOLERANSI:
            kalan = islem.lot
            while kalan > LOT_TOLERANSI and katman:
                dusulen = min(katman[-1][0], kalan)
                katman[-1][0] -= dusulen
                kalan -= dusulen
                if katman[-1][0] <= LOT_TOLERANSI:
                    katman.pop()

    kalanlar = [
        Islem(zaman=alim.zaman, ticker=alim.ticker, tip="BUY", lot=lot, fiyat=alim.fiyat)
        for katman in katmanlar.values()
        for lot, alim in katman
    ]
    return sorted(kalanlar, key=lambda islem: islem.zaman)


def elde_kalan_seriyi_ekle(sonuc: dict[str, Any], kalan_seri: list[dict[str, Any]]) -> dict[str, Any]:
    """Her noktaya elde kalan lotların maliyetini, kâr/zararını ve getirisini ekler."""
    sira = 0
    kalan_nokta = None
    for nokta in sonuc["series"]:
        # Tarih metinleri aynı biçimde olduğu için sıralı karşılaştırılabilir.
        while sira < len(kalan_seri) and kalan_seri[sira]["date"] <= nokta["date"]:
            kalan_nokta = kalan_seri[sira]
            sira += 1
        nokta["held_invested"] = kalan_nokta["total_invested"] if kalan_nokta else 0.0
        nokta["held_pnl"] = kalan_nokta["unrealized_pnl"] if kalan_nokta else 0.0
        nokta["held_return_pct"] = kalan_nokta["unrealized_return_pct"] if kalan_nokta else 0.0
    return sonuc


# Bölünme ve bedelsiz sermaye artırımları.
# Yahoo bu günlerden önceki fiyatları bölünmüş fiyata çevirir, bu yüzden portföydeki eski işlemler de aynı oranla düzeltilmelidir.
def bolunmeleri_ayikla(veri: pd.DataFrame, semboller: list[str]) -> dict[str, list[dict[str, Any]]]:
    """yfinance indirmesindeki Stock Splits kolonundan her hissenin bölünme tarihini, oranını ve o günkü kapanışını çıkarır."""
    sonuc: dict[str, list[dict[str, Any]]] = {}
    if veri.empty or "Stock Splits" not in veri.columns.get_level_values(0):
        return sonuc
    for sembol in semboller:
        tablo = hisse_tablosu(veri, f"{sembol}.IS")
        if tablo.empty or "Stock Splits" not in tablo:
            continue
        olaylar = []
        for gun, oran in tablo["Stock Splits"].dropna().items():
            if oran <= 0 or oran == 1:
                continue
            kapanis = tablo["Close"].get(gun) if "Close" in tablo else None
            olaylar.append({
                "tarih": gun.strftime("%Y-%m-%d"),
                "oran": float(oran),
                "kapanis": None if kapanis is None or pd.isna(kapanis) else round(float(kapanis), 2),
            })
        if olaylar:
            sonuc[sembol] = olaylar
    return sonuc


# Piyasa sayfası için tek hissenin fiyat tablosu ve günün özeti.
def hisse_tablosu(veri: pd.DataFrame, ticker: str) -> pd.DataFrame:
    """yfinance toplu indirmesinden tek hissenin Open/High/Low/Close/Volume tablosunu çıkarır."""
    if veri.empty:
        return pd.DataFrame()
    if isinstance(veri.columns, pd.MultiIndex):
        if ticker not in veri.columns.get_level_values(1):
            return pd.DataFrame()
        veri = veri.xs(ticker, axis=1, level=1)
    veri = veri.copy()
    index = pd.DatetimeIndex(veri.index)
    veri.index = index.tz_convert("Europe/Istanbul").tz_localize(None) if index.tz is not None else index
    return veri.dropna(how="all")


def gun_ozeti(saatlik: pd.DataFrame, gunluk: pd.DataFrame, gun: pd.Timestamp) -> dict[str, float | None]:
    """Seçilen günün açılış, en yüksek, en düşük ve hacmini döner.

    Günlük satır varsa o kullanılır, Yahoo o günü atladıysa saatlik mumlardan hesaplanır.
    """
    gun = gun.normalize()
    if not gunluk.empty:
        satirlar = gunluk[gunluk.index.normalize() == gun].dropna(subset=["Open", "High", "Low"])
        if len(satirlar):
            satir = satirlar.iloc[-1]
            return {"acilis": float(satir["Open"]), "yuksek": float(satir["High"]), "dusuk": float(satir["Low"]), "hacim": float(satir["Volume"])}
    if not saatlik.empty:
        mumlar = saatlik[saatlik.index.normalize() == gun].dropna(subset=["Open", "High", "Low"])
        if len(mumlar):
            return {
                "acilis": float(mumlar["Open"].iloc[0]),
                "yuksek": float(mumlar["High"].max()),
                "dusuk": float(mumlar["Low"].min()),
                "hacim": float(mumlar["Volume"].sum()),
            }
    return {"acilis": None, "yuksek": None, "dusuk": None, "hacim": None}
