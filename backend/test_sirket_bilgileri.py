# Şirket listesinin otomatik güncellenmesinin testleri. İnternete çıkmaz, sayfalar elle verilir.
import json
import tempfile
import unittest
from pathlib import Path

from sirket_bilgileri import ISY_ADRESI, KAP_ADRESI, adlari_ayikla, eksikleri_tamamla, sektorleri_ayikla, tr_baslik

ISY_SAYFASI = """
<option value="THYAO">THYAO | Türk Hava Yolları</option>
<option value="MAVI">MAVI | Mavi Giyim Sanayi Tic.A.S</option>
<option value="BIMAS">BIMAS | Bim Birleşik Mağazalar A.Ş</option>
<option value="KCHOL">KCHOL | Ko&#231; Holding</option>
"""
KAP_SAYFASI = (
    '{\\"sectorName\\":\\"ULAŞTIRMA VE DEPOLAMA\\",\\"sectorOid\\":\\"1\\",\\"sectorNo\\":\\"2\\",\\"mkkMemberOid\\":\\"3\\",\\"stockCode\\":\\"THYAO\\"},'
    '{\\"sectorName\\":\\"HOLDİNGLER VE YATIRIM ŞİRKETLERİ\\",\\"sectorOid\\":\\"1\\",\\"sectorNo\\":\\"2\\",\\"mkkMemberOid\\":\\"3\\",\\"stockCode\\":\\"KCHOL, KOC\\"}'
)


class AyiklamaTestleri(unittest.TestCase):
    def test_adlar_ayiklanir_ve_ekler_atilir(self):
        self.assertEqual(adlari_ayikla(ISY_SAYFASI), {
            "THYAO": "Türk Hava Yolları",
            "MAVI": "Mavi Giyim",
            "BIMAS": "Bim Birleşik Mağazalar",
            "KCHOL": "Koç Holding",
        })

    def test_sektorler_ayiklanir_ve_turkce_baslik_olur(self):
        self.assertEqual(sektorleri_ayikla(KAP_SAYFASI), {
            "THYAO": "Ulaştırma ve Depolama",
            "KCHOL": "Holdingler ve Yatırım Şirketleri",
            "KOC": "Holdingler ve Yatırım Şirketleri",
        })

    def test_turkce_baslik(self):
        self.assertEqual(tr_baslik("GIDA, İÇECEK VE TÜTÜN"), "Gıda, İçecek ve Tütün")
        self.assertEqual(tr_baslik("İNŞAAT VE BAYINDIRLIK İŞLERİ"), "İnşaat ve Bayındırlık İşleri")


class TamamlamaTestleri(unittest.TestCase):
    def setUp(self):
        self.klasor = tempfile.TemporaryDirectory()
        self.dosya = Path(self.klasor.name) / "sirketler.json"
        self.istekler = []

    def tearDown(self):
        self.klasor.cleanup()

    def indir(self, adres):
        self.istekler.append(adres)
        return {ISY_ADRESI: ISY_SAYFASI, KAP_ADRESI: KAP_SAYFASI}[adres]

    def test_eksik_yoksa_internete_cikilmaz(self):
        bilgiler = {"THYAO": {"ad": "Türk Hava Yolları", "sektor": "Ulaştırma ve Depolama"}}
        self.assertEqual(eksikleri_tamamla(bilgiler, ["THYAO"], self.indir, self.dosya), [])
        self.assertEqual(self.istekler, [])
        self.assertFalse(self.dosya.exists())

    def test_eksik_hisse_eklenir_ve_dosyaya_yazilir(self):
        bilgiler = {"THYAO": {"ad": "Türk Hava Yolları", "sektor": "Ulaştırma ve Depolama"}}
        self.assertEqual(eksikleri_tamamla(bilgiler, ["THYAO", "KCHOL"], self.indir, self.dosya), ["KCHOL"])
        self.assertEqual(bilgiler["KCHOL"], {"ad": "Koç Holding", "sektor": "Holdingler ve Yatırım Şirketleri"})
        self.assertEqual(json.loads(self.dosya.read_text(encoding="utf-8"))["KCHOL"]["ad"], "Koç Holding")

    def test_yalnizca_sektoru_eksik_olan_tamamlanir_ad_korunur(self):
        bilgiler = {"THYAO": {"ad": "THY", "sektor": ""}}
        eksikleri_tamamla(bilgiler, ["THYAO"], self.indir, self.dosya)
        self.assertEqual(bilgiler["THYAO"], {"ad": "THY", "sektor": "Ulaştırma ve Depolama"})

    def test_kaynaklarda_olmayan_hisse_eklenmez(self):
        bilgiler = {}
        self.assertEqual(eksikleri_tamamla(bilgiler, ["YOKYOK"], self.indir, self.dosya), [])
        self.assertEqual(bilgiler, {})

    def test_kaynaga_ulasilamazsa_hicbir_sey_degismez(self):
        def hatali(adres):
            raise OSError("bağlantı yok")
        bilgiler = {}
        self.assertEqual(eksikleri_tamamla(bilgiler, ["THYAO"], hatali, self.dosya), [])
        self.assertEqual(bilgiler, {})
        self.assertFalse(self.dosya.exists())


if __name__ == "__main__":
    unittest.main()
