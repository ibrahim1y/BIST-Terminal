# Arka planda yenilenen önbelleğin testleri. Saat elle ilerletilir, iş parçacığı başlatılmaz.
import unittest

from onbellek import TazeOnbellek


class SahteSaat:
    def __init__(self):
        self.zaman = 1000.0

    def __call__(self):
        return self.zaman


class TazeOnbellekTestleri(unittest.TestCase):
    def setUp(self):
        self.saat = SahteSaat()
        self.cagri = 0
        self.sonuclar = []
        self.onbellek = TazeOnbellek("deneme", self.getir, sure=30, etkin_sure=180, hata_bekleme=60, saat=self.saat)

    def getir(self):
        self.cagri += 1
        sonuc = self.sonuclar.pop(0) if self.sonuclar else [self.cagri]
        if isinstance(sonuc, Exception):
            raise sonuc
        return sonuc

    def test_ilk_okuma_veriyi_indirir_sonrakiler_onbellekten_gelir(self):
        self.assertEqual(self.onbellek.oku(), [1])
        self.saat.zaman += 100
        self.assertEqual(self.onbellek.oku(), [1])
        self.assertEqual(self.cagri, 1)

    def test_arka_plan_eskiyen_veriyi_istek_beklemeden_yeniler(self):
        self.onbellek.oku()
        self.saat.zaman += 10
        self.onbellek.adim()
        self.assertEqual(self.cagri, 1)
        self.saat.zaman += 30
        self.onbellek.adim()
        self.assertEqual(self.onbellek.oku(), [2])

    def test_kimse_bakmiyorsa_yenileme_durur(self):
        self.onbellek.oku()
        self.saat.zaman += 200
        self.onbellek.adim()
        self.assertEqual(self.cagri, 1)

    def test_acilista_veri_yoksa_arka_plan_hemen_indirir(self):
        self.onbellek.adim()
        self.assertEqual(self.cagri, 1)
        self.assertEqual(self.onbellek.veri, [1])

    def test_hatada_eski_veri_korunur_ve_bir_sure_beklenir(self):
        self.onbellek.oku()
        self.sonuclar = [OSError("bağlantı yok"), []]
        self.saat.zaman += 30
        self.onbellek.adim()
        self.assertEqual(self.onbellek.oku(), [1])
        self.saat.zaman += 30
        self.onbellek.adim()
        self.assertEqual(self.cagri, 2)
        self.saat.zaman += 31
        self.onbellek.adim()
        self.assertEqual(self.cagri, 3)
        self.assertEqual(self.onbellek.oku(), [1])

    def test_hic_veri_alinamazsa_bos_liste_doner(self):
        self.sonuclar = [[]]
        self.assertEqual(self.onbellek.oku(), [])


if __name__ == "__main__":
    unittest.main()
