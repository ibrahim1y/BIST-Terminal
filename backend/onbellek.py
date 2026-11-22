# Arka planda yenilenen önbellek.
# Ücretsiz sunucuda 100 hissenin verisini indirmek 45 saniye sürüyor. Süre dolunca yenilemeyi isteği yapan ziyaretçi beklemesin diye
# istekler her zaman eldeki veriyi hemen alır, yenileme arka planda yapılır.
# Son birkaç dakikada istek gelmediyse yenileme durur, böylece kimse bakmazken Yahoo'ya boşuna istek atılmaz.
import threading
import time
from typing import Any, Callable

SONSUZ_GECMIS = float("-inf")


class TazeOnbellek:
    def __init__(
        self,
        ad: str,
        getir: Callable[[], Any],
        sure: float = 30,
        etkin_sure: float = 180,
        hata_bekleme: float = 60,
        saat: Callable[[], float] = time.monotonic,
    ):
        self.ad = ad
        self.getir = getir
        self.sure = sure  # Verinin taze sayıldığı süre.
        self.etkin_sure = etkin_sure  # Son istekten sonra yenilemenin sürdüğü süre.
        self.hata_bekleme = hata_bekleme  # Başarısız indirmeden sonra yeniden denemeden önce beklenen süre.
        self.saat = saat
        self.veri: Any = None
        self.zaman = SONSUZ_GECMIS
        self.son_istek = SONSUZ_GECMIS
        self.son_hata = SONSUZ_GECMIS
        self.kilit = threading.Lock()

    def _yenile(self) -> None:
        with self.kilit:
            # Kilit beklenirken başka bir istek veriyi yenilemiş olabilir.
            if self.veri and self.saat() - self.zaman < self.sure:
                return
            try:
                veri = self.getir()
            except Exception as e:
                print(f"HATA - {self.ad} çekilemedi: {e}")
                veri = None
            if veri:
                self.veri = veri
                self.zaman = self.saat()
            else:
                self.son_hata = self.saat()

    def oku(self) -> Any:
        """Eldeki veriyi hemen döner. Hiç veri yoksa ilk indirme beklenir."""
        self.son_istek = self.saat()
        if not self.veri:
            self._yenile()
        return self.veri or []

    def yenilenmeli(self) -> bool:
        simdi = self.saat()
        if simdi - self.son_hata < self.hata_bekleme:
            return False
        if not self.veri:
            return True
        return simdi - self.son_istek < self.etkin_sure and simdi - self.zaman >= self.sure

    def adim(self) -> None:
        if self.yenilenmeli():
            self._yenile()

    def arka_planda_baslat(self, aralik: float = 5) -> None:
        """Sunucu açılınca ilk veriyi hemen indirir, sonra ziyaretçi oldukça veriyi taze tutar."""
        def dongu():
            while True:
                self.adim()
                time.sleep(aralik)

        threading.Thread(target=dongu, daemon=True, name=f"onbellek-{self.ad}").start()
