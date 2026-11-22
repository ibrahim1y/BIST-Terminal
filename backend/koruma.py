# Herkese açık sunucuda kötüye kullanıma karşı basit önlemler.
# İstek gövdesinin boyutu, portföy isteklerindeki işlem sayısı ve bir adresin dakikadaki istek sayısı sınırlanır.
import threading
import time
from collections import deque
from typing import Callable, Mapping

GOVDE_SINIRI = 256 * 1024  # bayt
ISLEM_SINIRI = 2000
# Uygulama açıkken bir ziyaretçi dakikada yaklaşık 15 istek atar. Sınır bunun epey üstündedir.
DAKIKALIK_ISTEK_SINIRI = 120


class HizSiniri:
    """Her anahtar için son pencere içindeki istekleri sayar, sınır aşılınca yeni isteği reddeder."""

    def __init__(self, sinir: int = DAKIKALIK_ISTEK_SINIRI, pencere: float = 60.0, saat: Callable[[], float] = time.monotonic):
        self.sinir = sinir
        self.pencere = pencere
        self.saat = saat
        self.kayitlar: dict[str, deque[float]] = {}
        self.kilit = threading.Lock()

    def izin_ver(self, anahtar: str) -> bool:
        simdi = self.saat()
        with self.kilit:
            # Uzun süre çalışan sunucuda bellek dolmasın diye süresi geçen adresler arada temizlenir.
            if len(self.kayitlar) > 10_000:
                self.kayitlar = {a: k for a, k in self.kayitlar.items() if k and k[-1] > simdi - self.pencere}
            istekler = self.kayitlar.setdefault(anahtar, deque())
            while istekler and istekler[0] <= simdi - self.pencere:
                istekler.popleft()
            if len(istekler) >= self.sinir:
                return False
            istekler.append(simdi)
            return True


def istemci_adresi(basliklar: Mapping[str, str], yedek: str) -> str:
    """Barındırma servisi isteği bir vekil sunucudan geçirdiği için gerçek adres X-Forwarded-For başlığının ilk değeridir."""
    iletilen = basliklar.get("x-forwarded-for", "")
    ilk = iletilen.split(",")[0].strip()
    return ilk or yedek


def govde_cok_buyuk(basliklar: Mapping[str, str], sinir: int = GOVDE_SINIRI) -> bool:
    uzunluk = basliklar.get("content-length", "")
    return uzunluk.isdigit() and int(uzunluk) > sinir
