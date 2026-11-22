# Şirket listesinin otomatik güncellenmesinin testleri. İnternete çıkmaz, sayfalar elle verilir.
import json
import tempfile
import unittest
from pathlib import Path

from sirket_bilgileri import ISY_ADRESI, KAP_ADRESI, adlari_ayikla, eksikleri_tamamla, sektorleri_ayikla, tr_baslik
# Endeks listesinin otomatik güncellenmesi için eklendi.
from sirket_bilgileri import endeks_uyelerini_ayikla, endeksi_guncelle, endeksi_yukle
# Endeks dışındaki portföy hisselerinin sorgusu için eklendi.
from sirket_bilgileri import EK_HISSE_SINIRI, ek_sembolleri_ayikla

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


# Endeks listesinin testleri. Sayfa, KAP'taki gibi tırnakları kaçışlı olarak verilir.
def kap_endeks_sayfasi(xu100, xu030=("THYAO",)):
    def blok(kod, semboller):
        icerik = ",".join(f'{{\\"stockCode\\":\\"{s}\\",\\"title\\":\\"{s} A.Ş.\\"}}' for s in semboller)
        return f'{{\\"code\\":\\"{kod}\\",\\"content\\":[{icerik}]}}'
    return f'\\"initialData\\":[{blok("XU100", xu100)},{blok("XU030", xu030)}]'


YUZ_HISSE = [f"H{i:03d}" for i in range(100)]


class EndeksTestleri(unittest.TestCase):
    def setUp(self):
        self.klasor = tempfile.TemporaryDirectory()
        self.dosya = Path(self.klasor.name) / "bist100.json"

    def tearDown(self):
        self.klasor.cleanup()

    def test_yalnizca_xu100_uyeleri_sirali_ayiklanir(self):
        sayfa = kap_endeks_sayfasi(["THYAO", "AKBNK", "KCHOL, KOC"], xu030=["ZZZZZ"])
        self.assertEqual(endeks_uyelerini_ayikla(sayfa), ["AKBNK", "KCHOL", "KOC", "THYAO"])

    def test_endeks_yoksa_bos_liste(self):
        self.assertEqual(endeks_uyelerini_ayikla("<html></html>"), [])

    def test_degisen_endeks_listeyi_yerinde_ve_dosyada_gunceller(self):
        semboller = YUZ_HISSE[:99] + ["ESKI"]
        ayni_liste = semboller
        self.assertTrue(endeksi_guncelle(semboller, lambda adres: kap_endeks_sayfasi(YUZ_HISSE), self.dosya))
        self.assertIs(semboller, ayni_liste)
        self.assertEqual(semboller, YUZ_HISSE)
        self.assertEqual(json.loads(self.dosya.read_text(encoding="utf-8"))["semboller"], YUZ_HISSE)

    def test_ayni_endekste_degisiklik_yok_ama_kontrol_zamani_yazilir(self):
        semboller = list(YUZ_HISSE)
        self.assertFalse(endeksi_guncelle(semboller, lambda adres: kap_endeks_sayfasi(YUZ_HISSE), self.dosya))
        self.assertGreater(json.loads(self.dosya.read_text(encoding="utf-8"))["guncelleme"], 0)

    def test_eksik_gelen_liste_kabul_edilmez(self):
        semboller = list(YUZ_HISSE)
        self.assertFalse(endeksi_guncelle(semboller, lambda adres: kap_endeks_sayfasi(YUZ_HISSE[:50]), self.dosya))
        self.assertEqual(semboller, YUZ_HISSE)
        self.assertFalse(self.dosya.exists())

    def test_kaynaga_ulasilamazsa_liste_degismez(self):
        def hatali(adres):
            raise OSError("bağlantı yok")
        semboller = list(YUZ_HISSE)
        self.assertFalse(endeksi_guncelle(semboller, hatali, self.dosya))
        self.assertEqual(semboller, YUZ_HISSE)

    def test_kayitli_liste_yuklenir_bozuk_dosyada_koddaki_liste_kalir(self):
        semboller = ["ESKI"]
        self.assertEqual(endeksi_yukle(semboller, self.dosya), 0.0)
        self.assertEqual(semboller, ["ESKI"])
        self.dosya.write_text(json.dumps({"guncelleme": 123.0, "semboller": YUZ_HISSE}), encoding="utf-8")
        self.assertEqual(endeksi_yukle(semboller, self.dosya), 123.0)
        self.assertEqual(semboller, YUZ_HISSE)
        self.dosya.write_text("bozuk", encoding="utf-8")
        semboller = ["ESKI"]
        endeksi_yukle(semboller, self.dosya)
        self.assertEqual(semboller, ["ESKI"])


# Ek hisse sorgusunun sembol ayıklaması.
class EkSembolTestleri(unittest.TestCase):
    def test_endekstekiler_gecersizler_ve_tekrarlar_atilir(self):
        self.assertEqual(
            ek_sembolleri_ayikla("asuzu, THYAO,KOZAL,,X,../x,ASUZU", ["THYAO"]),
            ["ASUZU", "KOZAL"],
        )

    def test_bos_sorgu_bos_liste(self):
        self.assertEqual(ek_sembolleri_ayikla("", ["THYAO"]), [])

    def test_en_fazla_sinir_kadar_hisse_doner(self):
        metin = ",".join(f"HS{i:03d}" for i in range(50))
        self.assertEqual(len(ek_sembolleri_ayikla(metin, [])), EK_HISSE_SINIRI)

    # Bölünme sorgusu daha yüksek bir sınırla çağrılır.
    def test_sinir_disaridan_verilebilir(self):
        metin = ",".join(f"HS{i:03d}" for i in range(50))
        self.assertEqual(len(ek_sembolleri_ayikla(metin, [], 40)), 40)


if __name__ == "__main__":
    unittest.main()
