# Herkese açık sunucudaki istek sınırlarının testleri. Saat elle ilerletilir.
import unittest

from koruma import HizSiniri, govde_cok_buyuk, istemci_adresi


class SahteSaat:
    def __init__(self):
        self.zaman = 1000.0

    def __call__(self):
        return self.zaman


class HizSiniriTestleri(unittest.TestCase):
    def setUp(self):
        self.saat = SahteSaat()
        self.sinir = HizSiniri(sinir=3, pencere=60, saat=self.saat)

    def test_sinira_kadar_izin_verir_sonra_reddeder(self):
        self.assertEqual([self.sinir.izin_ver("a") for _ in range(4)], [True, True, True, False])

    def test_adresler_birbirini_etkilemez(self):
        for _ in range(3):
            self.sinir.izin_ver("a")
        self.assertFalse(self.sinir.izin_ver("a"))
        self.assertTrue(self.sinir.izin_ver("b"))

    def test_pencere_gecince_yeniden_izin_verir(self):
        for _ in range(3):
            self.sinir.izin_ver("a")
        self.saat.zaman += 60
        self.assertTrue(self.sinir.izin_ver("a"))


class AdresVeGovdeTestleri(unittest.TestCase):
    def test_vekil_basligindaki_ilk_adres_kullanilir(self):
        self.assertEqual(istemci_adresi({"x-forwarded-for": "1.2.3.4, 10.0.0.1"}, "10.0.0.9"), "1.2.3.4")

    def test_baslik_yoksa_baglanti_adresi_kullanilir(self):
        self.assertEqual(istemci_adresi({}, "10.0.0.9"), "10.0.0.9")

    def test_govde_boyutu(self):
        self.assertTrue(govde_cok_buyuk({"content-length": "300"}, sinir=200))
        self.assertFalse(govde_cok_buyuk({"content-length": "100"}, sinir=200))
        self.assertFalse(govde_cok_buyuk({}, sinir=200))
        self.assertFalse(govde_cok_buyuk({"content-length": "abc"}, sinir=200))


if __name__ == "__main__":
    unittest.main()
