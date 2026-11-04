# WAC ve kâr hesabının testleri. İnternet gerektirmez, fiyatlar elle verilir.
# Çalıştırmak için backend klasöründe: python -m unittest
import unittest

import pandas as pd

from portfoy_analiz import IslemHatasi, gun_ici_seri_olustur, gunluk_seri_olustur, islemleri_coz


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

    def test_mum_icindeki_islem_o_mumdan_itibaren_sayilir_ve_oncesi_seriye_girmez(self):
        sonuc = self.gun_ici([islem("2026-11-04T10:07:00", "BUY", 10, 100)], {"THYAO.IS": [90, 100, 110]})
        self.assertEqual([n["date"][11:16] for n in sonuc["series"]], ["10:05", "10:10"])
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


if __name__ == "__main__":
    unittest.main()
