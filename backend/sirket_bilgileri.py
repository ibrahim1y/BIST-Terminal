# Şirket adı ve sektör listesinin otomatik güncellenmesi.
# Adlar İş Yatırım'ın hisse listesinden, sektörler KAP'ın sektör sayfasından alınır ve sirketler.json dosyasına yazılır.
# Yalnızca listede olmayan hisseler için internete çıkılır; kaynaklara ulaşılamazsa hisse sembolüyle gösterilir.
# BIST 100 endeksinin üyeleri de KAP'ın endeks sayfasından günde bir alınıp bist100.json dosyasına yazılır.
import html
import json
import re
import threading
import time
import urllib.request
from pathlib import Path
from typing import Callable

DOSYA = Path(__file__).with_name("sirketler.json")
ISY_ADRESI = "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/default.aspx"
KAP_ADRESI = "https://www.kap.org.tr/tr/Sektorler"
KONTROL_ARALIGI = 24 * 60 * 60  # saniye
# Endeks üyelerinin kaynağı ve kayıt dosyası.
ENDEKS_DOSYASI = Path(__file__).with_name("bist100.json")
KAP_ENDEKS_ADRESI = "https://www.kap.org.tr/tr/Endeksler"
ENDEKS_KODU = "XU100"
EN_AZ_UYE = 90  # Sayfa yarım gelirse liste küçülmesin diye alt sınır.
GECERLI_SEMBOL = re.compile(r"^[A-Z0-9]+$")

KUCUK_KELIMELER = {"ve", "ile", "ya", "da"}
SIRKET_EKI = re.compile(r"\s*(Sanayi\s+)?(Tic\.?\s*)?A\.?\s?[ŞS]\.?$")
ISY_SECENEGI = re.compile(r'<option value="([A-Z0-9]+)">\s*[A-Z0-9]+\s*\|\s*([^<]+)</option>')
KAP_SEKTORU = re.compile(
    r'"sectorName":"([^"]+)","sectorOid":"[^"]*","sectorNo":"[^"]*","mkkMemberOid":"[^"]*","stockCode":"([^"]+)"'
)

kilit = threading.Lock()


def tr_baslik(metin: str) -> str:
    """KAP'ın büyük harfli sektör adını Türkçe kurallarına göre başlık biçimine çevirir."""
    kelimeler = []
    for i, kelime in enumerate(metin.replace("I", "ı").replace("İ", "i").lower().split()):
        if i > 0 and kelime in KUCUK_KELIMELER:
            kelimeler.append(kelime)
        else:
            ilk = kelime[0]
            kelimeler.append(("İ" if ilk == "i" else "I" if ilk == "ı" else ilk.upper()) + kelime[1:])
    return " ".join(kelimeler)


def adlari_ayikla(sayfa: str) -> dict[str, str]:
    """İş Yatırım sayfasındaki hisse seçim listesinden sembol ve kısa adları çıkarır, A.Ş. gibi ekleri atar."""
    adlar = {}
    for sembol, ad in ISY_SECENEGI.findall(sayfa):
        adlar.setdefault(sembol, SIRKET_EKI.sub("", html.unescape(ad)).strip()[:80])
    return adlar


def sektorleri_ayikla(sayfa: str) -> dict[str, str]:
    """KAP sektör sayfasının içindeki veriden sembol ve sektörleri çıkarır."""
    sektorler = {}
    for sektor, semboller in KAP_SEKTORU.findall(sayfa.replace('\\"', '"')):
        for sembol in semboller.split(","):
            sektorler.setdefault(sembol.strip(), tr_baslik(sektor))
    return sektorler


# KAP sayfası her endeksin üyelerini code ve content alanlarıyla taşır, XU100 bloğu ayıklanır.
def endeks_uyelerini_ayikla(sayfa: str, kod: str = ENDEKS_KODU) -> list[str]:
    """KAP endeks sayfasının içindeki veriden endeksin hisse sembollerini sıralı olarak çıkarır."""
    sayfa = sayfa.replace('\\"', '"')
    baslik = f'"code":"{kod}","content":['
    bas = sayfa.find(baslik)
    if bas == -1:
        return []
    bitis = sayfa.find("]", bas + len(baslik))
    semboller = set()
    for kodlar in re.findall(r'"stockCode":"([^"]+)"', sayfa[bas:bitis]):
        semboller.update(s.strip() for s in kodlar.split(",") if GECERLI_SEMBOL.match(s.strip()))
    return sorted(semboller)


def sayfa_indir(adres: str) -> str:
    istek = urllib.request.Request(adres, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(istek, timeout=30) as yanit:
        return yanit.read().decode("utf-8", errors="replace")


def yukle(dosya: Path = DOSYA) -> dict[str, dict[str, str]]:
    try:
        return json.loads(dosya.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"HATA - şirket listesi okunamadı: {e}")
        return {}


def eksikleri_tamamla(
    bilgiler: dict[str, dict[str, str]],
    semboller: list[str],
    indir: Callable[[str], str] = sayfa_indir,
    dosya: Path = DOSYA,
) -> list[str]:
    """Listede adı veya sektörü olmayan hisseleri kaynaklardan bulur, sözlüğü ve dosyayı günceller.

    Eklenen hisselerin sembollerini döner. Kaynaklara ulaşılamazsa hiçbir şey değişmez.
    """
    eksikler = [s for s in semboller if not bilgiler.get(s, {}).get("ad") or not bilgiler.get(s, {}).get("sektor")]
    if not eksikler:
        return []
    try:
        adlar = adlari_ayikla(indir(ISY_ADRESI))
        sektorler = sektorleri_ayikla(indir(KAP_ADRESI))
    except Exception as e:
        print(f"HATA - şirket bilgileri indirilemedi: {e}")
        return []

    eklenenler = []
    with kilit:
        for sembol in eksikler:
            mevcut = bilgiler.get(sembol, {})
            ad = mevcut.get("ad") or adlar.get(sembol)
            sektor = mevcut.get("sektor") or sektorler.get(sembol)
            if not ad and not sektor:
                continue
            bilgiler[sembol] = {"ad": ad or sembol, "sektor": sektor or ""}
            eklenenler.append(sembol)
        if eklenenler:
            gecici = dosya.with_suffix(".tmp")
            gecici.write_text(json.dumps(bilgiler, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            gecici.replace(dosya)
    if eklenenler:
        print(f"Şirket listesine eklendi: {', '.join(eklenenler)}")
    return eklenenler


# Kayıtlı endeks listesi varsa uygulama onunla açılır, yoksa koddaki liste kullanılır.
def endeksi_yukle(semboller: list[str], dosya: Path = ENDEKS_DOSYASI) -> float:
    """Kayıtlı endeks listesini verilen listenin yerine koyar ve son güncelleme zamanını döner."""
    try:
        kayit = json.loads(dosya.read_text(encoding="utf-8"))
        kayitli = [s for s in kayit["semboller"] if GECERLI_SEMBOL.match(s)]
        if len(kayitli) >= EN_AZ_UYE:
            semboller[:] = kayitli
            return float(kayit.get("guncelleme", 0))
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(f"Kayıtlı endeks listesi okunamadı, koddaki liste kullanılıyor: {e}")
    return 0.0


# Endeks değiştiyse liste yerinde güncellenir, böylece listeyi kullanan her yer yeni üyeleri görür.
def endeksi_guncelle(
    semboller: list[str],
    indir: Callable[[str], str] = sayfa_indir,
    dosya: Path = ENDEKS_DOSYASI,
) -> bool:
    """Endeks üyelerini KAP'tan çeker, değişiklik varsa listeyi ve dosyayı günceller.

    Kaynağa ulaşılamazsa veya gelen liste şüpheli derecede kısaysa hiçbir şey değişmez.
    """
    try:
        yeni = endeks_uyelerini_ayikla(indir(KAP_ENDEKS_ADRESI))
    except Exception as e:
        print(f"HATA - endeks listesi indirilemedi: {e}")
        return False
    if len(yeni) < EN_AZ_UYE:
        print(f"HATA - endeks listesi eksik geldi ({len(yeni)} hisse), eski liste korunuyor")
        return False

    with kilit:
        eski = set(semboller)
        degisti = set(yeni) != eski
        if degisti:
            semboller[:] = yeni
        gecici = dosya.with_suffix(".tmp")
        gecici.write_text(
            json.dumps({"guncelleme": time.time(), "semboller": yeni}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        gecici.replace(dosya)
    if degisti:
        cikan, giren = sorted(eski - set(yeni)), sorted(set(yeni) - eski)
        print(f"Endeks listesi güncellendi. Giren: {', '.join(giren) or '-'}; çıkan: {', '.join(cikan) or '-'}")
    return degisti


def arka_planda_guncelle(
    bilgiler: dict[str, dict[str, str]],
    semboller: list[str],
    endeks_dosyasi: Path = ENDEKS_DOSYASI,
) -> None:
    """Açılışta ve günde bir endeks listesini ve eksik hisseleri arka planda tamamlar. Liste eksiksizse internete çıkılmaz."""
    # Endeks son 24 saatte kontrol edildiyse açılışta tekrar indirilmez, sunucu sık yeniden başlasa da istek atılmaz.
    son_kontrol = endeksi_yukle(semboller, endeks_dosyasi)

    def dongu():
        bekleme = threading.Event()
        bekle = max(0.0, son_kontrol + KONTROL_ARALIGI - time.time())
        while True:
            if bekle == 0:
                endeksi_guncelle(semboller, dosya=endeks_dosyasi)
            eksikleri_tamamla(bilgiler, semboller)
            bekleme.wait(bekle or KONTROL_ARALIGI)
            bekle = 0

    threading.Thread(target=dongu, daemon=True).start()
