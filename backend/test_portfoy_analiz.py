# WAC ve kâr hesabının testleri. İnternet gerektirmez, fiyatlar elle verilir.
# Çalıştırmak için backend klasöründe: python -m unittest
import unittest

import pandas as pd

from portfoy_analiz import IslemHatasi, donem_fiyat_tablosu, donem_kari_olustur, donem_pozisyonlari, elde_kalan_islemler, elde_kalan_seriyi_ekle, gun_ici_seri_olustur, gunluk_seri_olustur, islemleri_coz, seans_kapanislari, seans_tablosu


def islem(date, tip, quantity, price, ticker="THYAO.IS"):
    return {"date": date, "ticker": ticker, "type": tip, "quantity": quantity, "price": price}


def kapanis(fiyatlar, ticker="THYAO.IS"):
    return pd.DataFrame({ticker: list(fiyatlar.values())}, index=pd.to_datetime(list(fiyatlar.keys())))


def hesapla(kayitlar, fiyatlar, bitis):
    return gunluk_seri_olustur(islemleri_coz(kayitlar), fiyatlar, pd.Timestamp(bitis))


class WacTestleri(unittest.TestCase):
    def test_alis_agirlikli_ortalamayi_gunceller(self):
        sonuc = hesapla(
            [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-02", "BUY", 30, 200)],
            kapanis({"2026-10-01": 100, "2026-10-02": 200}),
            "2026-10-02",
        )
        self.assertEqual(sonuc["positions"][0]["wac"], 175)
        self.assertEqual(sonuc["summary"]["total_invested"], 7000)

    def test_alis_sahte_kar_yaratmaz(self):
        sonuc = hesapla(
            [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-02", "BUY", 90, 100)],
            kapanis({"2026-10-01": 100, "2026-10-02": 100}),
            "2026-10-02",
        )
        ilk, ikinci = sonuc["series"]
        self.assertEqual(ikinci["portfolio_value"], 10000)
        self.assertEqual(ikinci["total_invested"], 10000)
        self.assertEqual((ilk["unrealized_pnl"], ikinci["unrealized_pnl"]), (0, 0))

    def test_satis_wac_degistirmez_ve_kari_ayirir(self):
        sonuc = hesapla(
            [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-02", "SELL", 4, 150)],
            kapanis({"2026-10-01": 100, "2026-10-02": 150}),
            "2026-10-02",
        )
        self.assertEqual(sonuc["positions"][0]["wac"], 100)
        self.assertEqual(sonuc["positions"][0]["lots"], 6)
        self.assertEqual(sonuc["summary"]["realized_pnl"], 200)
        self.assertEqual(sonuc["summary"]["total_invested"], 600)
        self.assertEqual(sonuc["summary"]["unrealized_pnl"], 300)
        self.assertEqual(sonuc["summary"]["unrealized_return_pct"], 50)

    def test_tamami_satilinca_wac_sifirlanir_ve_yeni_alim_eskiden_etkilenmez(self):
        sonuc = hesapla(
            [
                islem("2026-10-01", "BUY", 10, 100),
                islem("2026-10-02", "SELL", 10, 120),
                islem("2026-10-03", "BUY", 5, 200),
            ],
            kapanis({"2026-10-01": 100, "2026-10-02": 120, "2026-10-03": 200}),
            "2026-10-03",
        )
        orta = sonuc["series"][1]
        self.assertEqual(orta["total_invested"], 0)
        self.assertEqual(orta["portfolio_value"], 0)
        self.assertEqual(orta["unrealized_return_pct"], 0)
        self.assertEqual(orta["realized_pnl"], 200)
        self.assertEqual(sonuc["positions"][0]["wac"], 200)

    def test_zararli_satis_gerceklesen_kari_dusurur(self):
        sonuc = hesapla(
            [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-02", "SELL", 10, 80)],
            kapanis({"2026-10-01": 100, "2026-10-02": 80}),
            "2026-10-02",
        )
        self.assertEqual(sonuc["summary"]["realized_pnl"], -200)
        self.assertEqual(sonuc["summary"]["total_invested"], 0)


class UcDurumTestleri(unittest.TestCase):
    def test_elde_olandan_fazla_satis_uygulanmaz(self):
        sonuc = hesapla(
            [islem("2026-10-01", "BUY", 5, 100), islem("2026-10-02", "SELL", 6, 150)],
            kapanis({"2026-10-01": 100, "2026-10-02": 150}),
            "2026-10-02",
        )
        self.assertEqual(sonuc["positions"][0]["lots"], 5)
        self.assertEqual(sonuc["summary"]["realized_pnl"], 0)
        self.assertGreaterEqual(sonuc["summary"]["total_invested"], 0)
        self.assertEqual(sonuc["warnings"]["rejected_sales"], [
            {"date": "2026-10-02", "ticker": "THYAO.IS", "quantity": 6.0, "available": 5.0}
        ])

    def test_kaydi_olmayan_hisse_satisi_reddedilir(self):
        sonuc = hesapla(
            [islem("2026-10-01", "SELL", 1, 100)],
            kapanis({"2026-10-01": 100}),
            "2026-10-01",
        )
        self.assertEqual(sonuc["positions"], [])
        self.assertEqual(len(sonuc["warnings"]["rejected_sales"]), 1)

    def test_ayni_gun_gonderilen_sira_korunur(self):
        sonuc = hesapla(
            [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-01", "SELL", 10, 110)],
            kapanis({"2026-10-01": 110}),
            "2026-10-01",
        )
        self.assertEqual(sonuc["warnings"]["rejected_sales"], [])
        self.assertEqual(sonuc["summary"]["realized_pnl"], 100)

    def test_ayni_gun_saatler_gonderim_sirasindan_once_gelir(self):
        sonuc = hesapla(
            [islem("2026-10-01T15:00:00", "SELL", 10, 110), islem("2026-10-01T10:00:00", "BUY", 10, 100)],
            kapanis({"2026-10-01": 110}),
            "2026-10-01",
        )
        self.assertEqual(sonuc["warnings"]["rejected_sales"], [])
        self.assertEqual(sonuc["summary"]["realized_pnl"], 100)

    def test_hafta_sonu_fiyat_ve_pozisyon_ileri_tasinir(self):
        # 2 Ekim 2026 Cuma, 5 Ekim 2026 Pazartesi.
        sonuc = hesapla(
            [islem("2026-10-02", "BUY", 10, 100)],
            kapanis({"2026-10-02": 110, "2026-10-05": 120}),
            "2026-10-05",
        )
        self.assertEqual(
            [(g["date"], g["portfolio_value"]) for g in sonuc["series"]],
            [("2026-10-02", 1100), ("2026-10-03", 1100), ("2026-10-04", 1100), ("2026-10-05", 1200)],
        )

    def test_ilk_islem_tatildeyse_onceki_kapanis_kullanilir(self):
        # 3 Ekim 2026 Cumartesi.
        sonuc = hesapla(
            [islem("2026-10-03", "BUY", 10, 100)],
            kapanis({"2026-10-02": 105}),
            "2026-10-03",
        )
        self.assertEqual(sonuc["series"][0]["portfolio_value"], 1050)
        self.assertEqual(sonuc["warnings"]["missing_prices"], [])

    def test_fiyati_olmayan_hisse_sahte_zarar_yazmaz(self):
        sonuc = hesapla(
            [islem("2026-10-01", "BUY", 10, 100, "YENI.IS"), islem("2026-10-01", "BUY", 1, 50)],
            kapanis({"2026-10-01": 60}),
            "2026-10-01",
        )
        self.assertEqual(sonuc["summary"]["portfolio_value"], 1060)
        self.assertEqual(sonuc["summary"]["unrealized_pnl"], 10)
        self.assertEqual(sonuc["warnings"]["missing_prices"], ["YENI.IS"])

    def test_ilk_islemden_onceki_gunler_seriye_girmez(self):
        sonuc = hesapla(
            [islem("2026-10-02", "BUY", 1, 100)],
            kapanis({"2026-10-01": 90, "2026-10-02": 100}),
            "2026-10-02",
        )
        self.assertEqual(sonuc["series"][0]["date"], "2026-10-02")

    def test_gecersiz_kayitlar_reddedilir(self):
        gecersizler = [
            {**islem("2026-10-01", "BUY", 1, 100), "ticker": "THYAO"},
            islem("2026-10-01", "HOLD", 1, 100),
            islem("2026-10-01", "BUY", 0, 100),
            islem("2026-10-01", "BUY", -1, 100),
            islem("2026-10-01", "BUY", 1, 0),
            islem("2026-10-01", "BUY", 1, float("nan")),
            islem("bozuk", "BUY", 1, 100),
            islem(None, "BUY", 1, 100),
        ]
        for kayit in gecersizler:
            with self.subTest(kayit=kayit), self.assertRaises(IslemHatasi):
                islemleri_coz([kayit])


# 1G görünümünün gün içi hesabı.
class GunIciTestleri(unittest.TestCase):
    def gun_ici(self, kayitlar, fiyatlar):
        return gun_ici_seri_olustur(islemleri_coz(kayitlar), pd.DataFrame(fiyatlar, index=pd.to_datetime(
            ["2026-11-04T10:00:00", "2026-11-04T10:05:00", "2026-11-04T10:10:00"]
        )))

    def test_onceki_gunlerin_lot_ve_maliyeti_tasinir_fiyat_degisimi_yansir(self):
        sonuc = self.gun_ici([islem("2026-10-01T10:00:00", "BUY", 10, 100)], {"THYAO.IS": [110, 120, 115]})
        self.assertEqual([n["portfolio_value"] for n in sonuc["series"]], [1100, 1200, 1150])
        self.assertEqual([n["total_invested"] for n in sonuc["series"]], [1000, 1000, 1000])
        self.assertEqual(sonuc["series"][0]["date"], "2026-11-04T10:00:00")

    def test_mum_icindeki_islem_o_mumdan_itibaren_sayilir_oncesi_sifirdir(self):
        sonuc = self.gun_ici([islem("2026-11-04T10:07:00", "BUY", 10, 100)], {"THYAO.IS": [90, 100, 110]})
        self.assertEqual([n["date"][11:16] for n in sonuc["series"]], ["10:00", "10:05", "10:10"])
        self.assertEqual([n["portfolio_value"] for n in sonuc["series"]], [0, 1000, 1100])
        self.assertEqual(sonuc["summary"]["unrealized_pnl"], 100)

    def test_gun_ici_satis_gerceklesen_kari_islem_aninda_yansitir(self):
        sonuc = self.gun_ici(
            [islem("2026-10-01T10:00:00", "BUY", 10, 100), islem("2026-11-04T10:07:00", "SELL", 4, 150)],
            {"THYAO.IS": [150, 150, 150]},
        )
        self.assertEqual([n["realized_pnl"] for n in sonuc["series"]], [0, 200, 200])
        self.assertEqual([n["total_invested"] for n in sonuc["series"]], [1000, 600, 600])
        self.assertEqual(sonuc["positions"][0]["lots"], 6)

    def test_seans_sonrasi_islem_ayri_son_nokta_olur(self):
        sonuc = self.gun_ici(
            [islem("2026-10-01T10:00:00", "BUY", 10, 100), islem("2026-11-04T19:00:00", "BUY", 10, 120)],
            {"THYAO.IS": [120, 120, 120]},
        )
        self.assertEqual(len(sonuc["series"]), 4)
        self.assertEqual(sonuc["summary"]["date"], "2026-11-04T19:00:00")
        self.assertEqual(sonuc["summary"]["total_invested"], 2200)
        self.assertEqual(sonuc["summary"]["portfolio_value"], 2400)

    def test_seans_basinda_islem_gormeyen_hisse_ilk_fiyatla_baslar(self):
        sonuc = self.gun_ici([islem("2026-10-01", "BUY", 10, 100)], {"THYAO.IS": [float("nan"), 120, 130]})
        self.assertEqual(sonuc["series"][0]["portfolio_value"], 1200)
        self.assertEqual(sonuc["warnings"]["missing_prices"], [])

    def test_fiyati_hic_olmayan_hisse_son_islem_fiyatiyla_hesaplanir(self):
        sonuc = self.gun_ici(
            [islem("2026-10-01", "BUY", 10, 100, "YENI.IS"), islem("2026-10-01", "BUY", 1, 50)],
            {"THYAO.IS": [60, 60, 60]},
        )
        self.assertEqual(sonuc["summary"]["portfolio_value"], 1060)
        self.assertEqual(sonuc["warnings"]["missing_prices"], ["YENI.IS"])
        self.assertEqual({p["ticker"]: p["last_price"] for p in sonuc["positions"]}, {"THYAO.IS": 60, "YENI.IS": 100})

    def test_reddedilen_satis_raporlanir(self):
        sonuc = self.gun_ici(
            [islem("2026-10-01", "BUY", 5, 100), islem("2026-10-02", "SELL", 6, 150)],
            {"THYAO.IS": [100, 100, 100]},
        )
        self.assertEqual(len(sonuc["warnings"]["rejected_sales"]), 1)
        self.assertEqual(sonuc["positions"][0]["lots"], 5)


# Günlük değişimin dayandığı seans kapanışları.
class SeansKapanisiTestleri(unittest.TestCase):
    def test_her_seansin_son_fiyatini_alir(self):
        index = pd.to_datetime(["2026-11-04T17:00:00", "2026-11-04T18:00:00", "2026-11-05T10:00:00"]).tz_localize("Europe/Istanbul")
        sonuc = seans_kapanislari(pd.DataFrame({"A.IS": [100.0, 110.0, 115.0]}, index=index))
        self.assertEqual(sonuc["A.IS"].tolist(), [110.0, 115.0])
        self.assertEqual([g.strftime("%Y-%m-%d") for g in sonuc.index], ["2026-11-04", "2026-11-05"])

    def test_seans_sonundaki_bos_fiyat_atlanir(self):
        index = pd.to_datetime(["2026-11-04T17:00:00", "2026-11-04T18:00:00"]).tz_localize("Europe/Istanbul")
        sonuc = seans_kapanislari(pd.DataFrame({"A.IS": [100.0, float("nan")]}, index=index))
        self.assertEqual(sonuc["A.IS"].tolist(), [100.0])

    def test_gunler_istanbul_saatine_gore_ayrilir(self):
        index = pd.to_datetime(["2026-11-04T22:00:00"]).tz_localize("UTC")
        sonuc = seans_kapanislari(pd.DataFrame({"A.IS": [100.0]}, index=index))
        self.assertEqual(sonuc.index[0].strftime("%Y-%m-%d"), "2026-11-05")


# Dönem kâr/zararının referansları.
class DonemKariTestleri(unittest.TestCase):
    def pozisyonlar(self, kayitlar, baslangic, fiyatlar=None):
        kapanislar = kapanis(fiyatlar) if fiyatlar else pd.DataFrame()
        return donem_pozisyonlari(islemleri_coz(kayitlar), pd.Timestamp(baslangic), kapanislar)

    def test_donem_basindan_once_alinan_lot_o_gunku_kapanisi_referans_alir(self):
        sonuc = self.pozisyonlar([islem("2026-10-01", "BUY", 10, 100)], "2026-10-10", {"2026-10-10": 150, "2026-10-20": 170})
        self.assertEqual(sonuc, [{"ticker": "THYAO.IS", "lots": 10, "reference": 1500.0}])

    def test_tatil_gunu_baslangicinda_onceki_kapanis_kullanilir(self):
        sonuc = self.pozisyonlar([islem("2026-10-01", "BUY", 10, 100)], "2026-10-11", {"2026-10-09": 140, "2026-10-12": 170})
        self.assertEqual(sonuc[0]["reference"], 1400.0)

    def test_donem_icinde_alinan_lot_alis_fiyatini_referans_alir(self):
        sonuc = self.pozisyonlar(
            [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-15", "BUY", 5, 200)],
            "2026-10-10",
            {"2026-10-10": 150},
        )
        self.assertEqual(sonuc[0], {"ticker": "THYAO.IS", "lots": 15, "reference": 2500.0})

    def test_tamami_satilan_hisse_hesaba_girmez(self):
        kayitlar = [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-15", "SELL", 10, 300)]
        self.assertEqual(self.pozisyonlar(kayitlar, "2026-10-10", {"2026-10-10": 150}), [])
        self.assertEqual(self.pozisyonlar(kayitlar, "2026-10-20", {"2026-10-20": 150}), [])

    def test_satilan_lotun_kari_kalan_lota_karismaz(self):
        sonuc = self.pozisyonlar(
            [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-15", "SELL", 4, 300)],
            "2026-10-10",
            {"2026-10-10": 150},
        )
        self.assertEqual(sonuc[0], {"ticker": "THYAO.IS", "lots": 6, "reference": 900.0})

    def test_donem_icinde_satis_once_son_alinan_lottan_duser(self):
        sonuc = self.pozisyonlar(
            [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-15", "BUY", 5, 200), islem("2026-10-16", "SELL", 5, 250)],
            "2026-10-10",
            {"2026-10-10": 150},
        )
        self.assertEqual(sonuc[0], {"ticker": "THYAO.IS", "lots": 10, "reference": 1500.0})

    def test_tamami_satilip_yeniden_alinan_lot_yeni_alis_fiyatini_kullanir(self):
        sonuc = self.pozisyonlar(
            [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-15", "SELL", 10, 150), islem("2026-10-16", "BUY", 5, 200)],
            "2026-10-10",
            {"2026-10-10": 150},
        )
        self.assertEqual(sonuc[0], {"ticker": "THYAO.IS", "lots": 5, "reference": 1000.0})

    def test_elde_olandan_fazla_satis_uygulanmaz(self):
        sonuc = self.pozisyonlar(
            [islem("2026-10-01", "BUY", 5, 100), islem("2026-10-15", "SELL", 6, 150)],
            "2026-10-10",
            {"2026-10-10": 120},
        )
        self.assertEqual(sonuc[0]["lots"], 5)

    def test_fiyat_yoksa_maliyet_referans_alinir(self):
        sonuc = self.pozisyonlar([islem("2026-10-01", "BUY", 10, 100)], "2026-10-10")
        self.assertEqual(sonuc[0]["reference"], 1000.0)

    def test_gunluk_donem_onceki_seansi_kullanir(self):
        kapanislar = kapanis({"2026-11-03": 265, "2026-11-04": 290, "2026-11-05": 300})
        sonuc = donem_kari_olustur(
            islemleri_coz([islem("2026-10-01", "BUY", 10, 100)]),
            kapanislar,
            pd.to_datetime(["2026-11-03", "2026-11-04", "2026-11-05"]),
            pd.Timestamp("2026-11-05"),
        )
        self.assertEqual(sonuc["1g"][0]["reference"], 2900.0)
        self.assertEqual(sorted(sonuc), ["1a", "1g", "1h", "1y", "3a", "5y"])

    def test_bugun_alinan_lot_gunluk_donemde_alis_fiyatini_kullanir(self):
        sonuc = donem_kari_olustur(
            islemleri_coz([islem("2026-11-05T10:00:00", "BUY", 10, 295)]),
            kapanis({"2026-11-04": 290, "2026-11-05": 300}),
            pd.to_datetime(["2026-11-04", "2026-11-05"]),
            pd.Timestamp("2026-11-05"),
        )
        self.assertEqual(sonuc["1g"][0]["reference"], 2950.0)


# Kâr/Zarar grafiğinin elde kalan lot hesabı.
class EldeKalanTestleri(unittest.TestCase):
    def kalanlar(self, kayitlar):
        return [(i.ticker, i.lot, i.fiyat) for i in elde_kalan_islemler(islemleri_coz(kayitlar))]

    def seri(self, kayitlar, fiyatlar, bitis):
        islemler = islemleri_coz(kayitlar)
        kapanislar = kapanis(fiyatlar)
        kalanlar = elde_kalan_islemler(islemler)
        kalan_seri = gunluk_seri_olustur(kalanlar, kapanislar, pd.Timestamp(bitis))["series"] if kalanlar else []
        return elde_kalan_seriyi_ekle(gunluk_seri_olustur(islemler, kapanislar, pd.Timestamp(bitis)), kalan_seri)["series"]

    def test_tamami_satilan_alim_cikar(self):
        self.assertEqual(self.kalanlar([islem("2026-10-01", "BUY", 10, 100), islem("2026-10-02", "SELL", 10, 150)]), [])

    def test_satis_en_son_alimdan_duser(self):
        self.assertEqual(
            self.kalanlar([islem("2026-10-01", "BUY", 10, 100), islem("2026-10-02", "BUY", 5, 200), islem("2026-10-03", "SELL", 7, 250)]),
            [("THYAO.IS", 8, 100)],
        )

    def test_elde_olandan_fazla_satis_uygulanmaz(self):
        self.assertEqual(self.kalanlar([islem("2026-10-01", "BUY", 5, 100), islem("2026-10-02", "SELL", 6, 150)]), [("THYAO.IS", 5, 100)])

    def test_satilan_hisse_gecmisten_de_cikar(self):
        seri = self.seri(
            [
                islem("2026-10-01", "BUY", 10, 100),
                islem("2026-10-01", "BUY", 5, 300, "ASELS.IS"),
                islem("2026-10-03", "SELL", 5, 400, "ASELS.IS"),
            ],
            {"2026-10-01": 110, "2026-10-02": 120, "2026-10-03": 130},
            "2026-10-03",
        )
        self.assertEqual([n["held_pnl"] for n in seri], [100, 200, 300])
        self.assertEqual(seri[-1]["held_invested"], 1000)
        self.assertEqual(seri[-1]["realized_pnl"], 500)

    def test_hepsi_satilinca_kar_sifir_olur(self):
        seri = self.seri([islem("2026-10-01", "BUY", 10, 100), islem("2026-10-02", "SELL", 10, 150)], {"2026-10-01": 110, "2026-10-02": 150}, "2026-10-02")
        self.assertEqual([n["held_pnl"] for n in seri], [0, 0])
        self.assertEqual(seri[-1]["held_return_pct"], 0)

    def test_sonradan_alinan_lot_alindigi_gunden_itibaren_sayilir(self):
        seri = self.seri(
            [islem("2026-10-01", "BUY", 10, 100, "ASELS.IS"), islem("2026-10-02", "BUY", 10, 100)],
            {"2026-10-01": 100, "2026-10-02": 110},
            "2026-10-02",
        )
        self.assertEqual(seri[1]["held_invested"], 2000)

    def test_son_deger_donem_karinin_tum_lotlari_kapsayan_haliyle_ayni(self):
        kayitlar = [islem("2026-10-01", "BUY", 10, 100), islem("2026-10-02", "BUY", 5, 200), islem("2026-10-03", "SELL", 5, 250)]
        fiyatlar = {"2026-10-01": 100, "2026-10-02": 200, "2026-10-03": 260}
        seri = self.seri(kayitlar, fiyatlar, "2026-10-03")
        referans = donem_pozisyonlari(islemleri_coz(kayitlar), pd.Timestamp("2026-09-01"), kapanis(fiyatlar))
        self.assertEqual(seri[-1]["held_pnl"], 10 * 260 - referans[0]["reference"])


# Günlük ve saatlik kapanışların birleşimi.
class SeansTablosuTestleri(unittest.TestCase):
    def saatlik(self, degerler):
        index = pd.to_datetime(list(degerler)).tz_localize("Europe/Istanbul")
        return pd.DataFrame({"A.IS": list(degerler.values())}, index=index)

    def gunluk(self, degerler):
        return pd.DataFrame({"A.IS": list(degerler.values())}, index=pd.to_datetime(list(degerler)))

    def test_gunluk_kapanis_saatlik_son_fiyattan_onceliklidir(self):
        sonuc = seans_tablosu(self.saatlik({"2026-11-05T17:00:00": 16.67}), self.gunluk({"2026-11-05": 16.77}))
        self.assertEqual(sonuc["A.IS"].tolist(), [16.77])

    def test_gunluk_veride_eksik_gun_saatlik_veriyle_tamamlanir(self):
        sonuc = seans_tablosu(
            self.saatlik({"2026-11-04T17:00:00": 290.0, "2026-11-05T17:00:00": 299.0}),
            self.gunluk({"2026-11-03": 265.0, "2026-11-05": 300.0}),
        )
        self.assertEqual(sonuc["A.IS"].tolist(), [265.0, 290.0, 300.0])

    def test_gunluk_veride_bos_fiyat_saatlik_veriyle_dolar(self):
        sonuc = seans_tablosu(self.saatlik({"2026-11-05T17:00:00": 299.0}), self.gunluk({"2026-11-05": float("nan")}))
        self.assertEqual(sonuc["A.IS"].tolist(), [299.0])

    def test_tek_kaynak_bosken_digeri_kullanilir(self):
        self.assertEqual(seans_tablosu(pd.DataFrame(), self.gunluk({"2026-11-05": 300.0}))["A.IS"].tolist(), [300.0])
        self.assertEqual(seans_tablosu(self.saatlik({"2026-11-05T17:00:00": 299.0}), pd.DataFrame())["A.IS"].tolist(), [299.0])

    def test_iki_kaynak_da_bossa_bos_doner(self):
        self.assertTrue(seans_tablosu(pd.DataFrame(), pd.DataFrame()).empty)


# Portföy grafiğinin dönem fiyat tablosu ve saatlik noktaları.
class DonemFiyatTablosuTestleri(unittest.TestCase):
    def saatlik(self, degerler):
        index = pd.to_datetime(list(degerler)).tz_localize("Europe/Istanbul")
        return pd.DataFrame({"A.IS": list(degerler.values())}, index=index)

    def test_her_gune_gunluk_kapanis_noktasi_eklenir(self):
        sonuc = donem_fiyat_tablosu(
            self.saatlik({"2026-11-05T17:30:00": 16.67}),
            kapanis({"2026-11-04": 16.6, "2026-11-05": 16.77}, "A.IS"),
            pd.Timestamp("2026-11-04T18:10:00"),
            pd.Timedelta(hours=1),
        )
        self.assertEqual(
            [(z.strftime("%m-%d %H:%M"), f) for z, f in sonuc["A.IS"].items()],
            [("11-04 18:10", 16.6), ("11-05 18:00", 16.67), ("11-05 18:10", 16.77)],
        )

    def test_donem_basi_hafta_sonuysa_son_kapanisla_baslar(self):
        sonuc = donem_fiyat_tablosu(
            self.saatlik({"2026-11-02T10:00:00": 105.0}),
            kapanis({"2026-10-30": 100.0}, "A.IS"),
            pd.Timestamp("2026-11-01T18:10:00"),
        )
        self.assertEqual(sonuc.index[0], pd.Timestamp("2026-11-01T18:10:00"))
        self.assertEqual(sonuc["A.IS"].tolist(), [100.0, 105.0])

    def test_donem_basindan_onceki_noktalar_atilir(self):
        sonuc = donem_fiyat_tablosu(
            self.saatlik({"2026-11-04T10:00:00": 1.0, "2026-11-05T10:00:00": 2.0}),
            pd.DataFrame(),
            pd.Timestamp("2026-11-04T18:10:00"),
        )
        self.assertEqual(sonuc["A.IS"].tolist(), [1.0, 2.0])
        self.assertEqual(sonuc.index[1], pd.Timestamp("2026-11-05T10:00:00"))

    def test_saatlik_islem_icinde_bulundugu_saatten_itibaren_sayilir(self):
        fiyatlar = pd.DataFrame({"THYAO.IS": [100.0, 110.0, 120.0]}, index=pd.to_datetime(
            ["2026-11-05T10:00:00", "2026-11-05T11:00:00", "2026-11-05T12:00:00"]
        ))
        sonuc = gun_ici_seri_olustur(islemleri_coz([islem("2026-11-05T11:30:00", "BUY", 10, 105)]), fiyatlar, pd.Timedelta(hours=1))
        self.assertEqual([(n["date"][11:16], n["total_invested"]) for n in sonuc["series"]], [("10:00", 0), ("11:00", 1050), ("12:00", 1050)])


# Mum zamanı ve süren seans.
class MumZamaniTestleri(unittest.TestCase):
    def saatlik(self, degerler):
        index = pd.to_datetime(list(degerler)).tz_localize("Europe/Istanbul")
        return pd.DataFrame({"A.IS": list(degerler.values())}, index=index)

    def zamanlar(self, tablo):
        return [(z.strftime("%m-%d %H:%M"), f) for z, f in tablo["A.IS"].items()]

    def test_nokta_mumun_bittigi_ana_tasinir_son_mum_18i_gecmez(self):
        sonuc = donem_fiyat_tablosu(
            self.saatlik({"2026-11-05T09:30:00": 302.25, "2026-11-05T17:30:00": 295.5}),
            kapanis({"2026-11-04": 291.25, "2026-11-05": 297.0}, "A.IS"),
            pd.Timestamp("2026-11-04T18:10:00"),
            pd.Timedelta(hours=1),
        )
        self.assertEqual(self.zamanlar(sonuc), [("11-04 18:10", 291.25), ("11-05 10:30", 302.25), ("11-05 18:00", 295.5), ("11-05 18:10", 297.0)])

    def test_seans_suruyorsa_gunluk_fiyat_son_noktaya_yazilir(self):
        sonuc = donem_fiyat_tablosu(
            self.saatlik({"2026-11-06T09:30:00": 289.75, "2026-11-06T11:30:00": 297.0}),
            kapanis({"2026-11-05": 297.0, "2026-11-06": 297.25}, "A.IS"),
            pd.Timestamp("2026-11-05T18:10:00"),
            pd.Timedelta(hours=1),
        )
        self.assertEqual(self.zamanlar(sonuc), [("11-05 18:10", 297.0), ("11-06 10:30", 289.75), ("11-06 12:30", 297.25)])

    def test_islem_noktanin_zamanindan_once_yapildiysa_o_noktada_sayilir(self):
        fiyatlar = pd.DataFrame({"THYAO.IS": [100.0, 110.0]}, index=pd.to_datetime(["2026-11-05T10:30:00", "2026-11-05T11:30:00"]))
        sonuc = gun_ici_seri_olustur(islemleri_coz([islem("2026-11-05T10:45:00", "BUY", 10, 105)]), fiyatlar, pd.Timedelta(0))
        self.assertEqual([(n["date"][11:16], n["total_invested"]) for n in sonuc["series"]], [("10:30", 0), ("11:30", 1050)])


if __name__ == "__main__":
    unittest.main()
