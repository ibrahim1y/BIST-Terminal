import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alimUygula,
  analiziCanlandir,
  analizIslemleri,
  // Bölünme düzeltmesi testleri için.
  bolunmeleriUygula,
  bolunmeOrani,
  // Örnek portföy testleri için.
  demoPortfoyuOlustur,
  seriyiDonemeGoreKes,
  donemDegisimi,
  donemKari,
  donemKarSerisi,
  donemBasinaKadarDoldur,
  endeksDisiSemboller,
  enFazlaLot,
  isaretliTl,
  isaretliYuzde,
  tl,
  kapaliGunleriCikar,
  bakiyeHesapla,
  gecerliIslemKaydi,
  gecerliNakitKaydi,
  gecerliPortfoyKaydi,
  gerceklesenKarZarar,
  grafikSembolleri,
  islemKaydi,
  kaydiOlmayanHisseler,
  karZararHesapla,
  kayitliListeyiOku,
  lotMiktariniCoz,
  nakitHareketi,
  paraYatir,
  pastaRengi,
  portfoyOzeti,
  satimUygula,
  sonFiyatBul,
  tutarCoz,
  yeterliBakiyeVarMi,
} from './portfoy';

const hisse = (sembol, lot, maliyet, fiyat = maliyet) => ({ id: 1, sembol, ad: sembol, fiyat, degisim: 0, lot, maliyet });

describe('lotMiktariniCoz', () => {
  it('pozitif tam sayıları kabul eder', () => {
    expect(lotMiktariniCoz('3')).toBe(3);
    expect(lotMiktariniCoz('1000')).toBe(1000);
  });

  it.each(['1.5', '0', '-2', '', 'abc'])('%s değerini reddeder', (deger) => {
    expect(lotMiktariniCoz(deger)).toBeNull();
  });
});

describe('alimUygula', () => {
  const secili = { id: 1, sembol: 'A', ad: 'A', fiyat: 90, degisim: 1 };

  it('yeni hisseyi onay anındaki fiyatla ekler', () => {
    const sonuc = alimUygula([], secili, 2, 120);
    expect(sonuc).toHaveLength(1);
    expect(sonuc[0]).toMatchObject({ sembol: 'A', lot: 2, maliyet: 120, fiyat: 120 });
  });

  it('ek alımda ağırlıklı ortalama maliyet hesaplar', () => {
    const sonuc = alimUygula([hisse('A', 2, 120)], secili, 2, 150);
    expect(sonuc[0]).toMatchObject({ lot: 4, maliyet: 135 });
  });

  it('farklı lot sayılarında ortalamayı doğru ağırlıklandırır', () => {
    const sonuc = alimUygula([hisse('A', 3, 100)], secili, 1, 200);
    expect(sonuc[0]).toMatchObject({ lot: 4, maliyet: 125 });
  });

  it('diğer hisseleri ve eski listeyi değiştirmez', () => {
    const portfoy = [hisse('A', 2, 120), hisse('B', 5, 50)];
    const kopya = structuredClone(portfoy);
    const sonuc = alimUygula(portfoy, secili, 2, 150);
    expect(sonuc[1]).toEqual(kopya[1]);
    expect(portfoy).toEqual(kopya);
  });
});

describe('satimUygula', () => {
  it('kısmi satışta lotu azaltır, maliyeti korur', () => {
    const sonuc = satimUygula([hisse('A', 5, 100)], 'A', 2);
    expect(sonuc[0]).toMatchObject({ lot: 3, maliyet: 100 });
  });

  it('tam satışta hisseyi portföyden çıkarır', () => {
    const sonuc = satimUygula([hisse('A', 5, 100), hisse('B', 1, 10)], 'A', 5);
    expect(sonuc.map(p => p.sembol)).toEqual(['B']);
  });

  it('yetersiz lotta null döner', () => {
    expect(satimUygula([hisse('A', 5, 100)], 'A', 6)).toBeNull();
  });

  it('portföyde olmayan hissede null döner', () => {
    expect(satimUygula([hisse('A', 5, 100)], 'B', 1)).toBeNull();
  });

  it('eski listeyi değiştirmez', () => {
    const portfoy = [hisse('A', 5, 100)];
    satimUygula(portfoy, 'A', 2);
    expect(portfoy[0].lot).toBe(5);
  });
});

// Endeksten çıkan portföy hisselerinin bulunması.
describe('endeksDisiSemboller', () => {
  const hisseler = [{ sembol: 'THYAO' }, { sembol: 'AKBNK' }];

  it('piyasa listesinde olmayan portföy hisselerini sıralı ve tekrarsız verir', () => {
    const portfoy = [{ sembol: 'ZZZ' }, { sembol: 'THYAO' }, { sembol: 'ASUZU' }, { sembol: 'ZZZ' }];
    expect(endeksDisiSemboller(portfoy, hisseler)).toEqual(['ASUZU', 'ZZZ']);
  });

  it('hepsi listedeyse boş döner', () => {
    expect(endeksDisiSemboller([{ sembol: 'AKBNK' }], hisseler)).toEqual([]);
  });

  it('piyasa listesi henüz gelmediyse hiçbirini saymaz', () => {
    expect(endeksDisiSemboller([{ sembol: 'ASUZU' }], [])).toEqual([]);
  });
});

describe('sonFiyatBul', () => {
  it('kayıtlı son fiyatı kullanır', () => {
    expect(sonFiyatBul(hisse('A', 1, 100), { A: 130 })).toBe(130);
  });

  it('kayıt yoksa son işlem fiyatına döner', () => {
    expect(sonFiyatBul(hisse('A', 1, 100, 90), {})).toBe(90);
  });

  it('sıfır fiyatı kayıt olarak kabul eder', () => {
    expect(sonFiyatBul(hisse('A', 1, 100), { A: 0 })).toBe(0);
  });
});

describe('karZararHesapla', () => {
  it('kârı tutar ve yüzde olarak hesaplar', () => {
    expect(karZararHesapla(hisse('A', 5, 100), 120)).toEqual({ karZarar: 100, karZararYuzde: 20 });
  });

  it('zararı negatif hesaplar', () => {
    expect(karZararHesapla(hisse('A', 5, 100), 80)).toEqual({ karZarar: -100, karZararYuzde: -20 });
  });
});

describe('portfoyOzeti', () => {
  it('boş portföyde sıfır döner', () => {
    expect(portfoyOzeti([], {})).toEqual({
      toplamPortfoyDegeri: 0,
      toplamMaliyet: 0,
      toplamKarZarar: 0,
      toplamKarZararYuzde: 0,
    });
  });

  it('son fiyatlarla toplamları hesaplar', () => {
    const portfoy = [hisse('A', 5, 100), hisse('B', 5, 100)];
    expect(portfoyOzeti(portfoy, { A: 120, B: 90 })).toEqual({
      toplamPortfoyDegeri: 1050,
      toplamMaliyet: 1000,
      toplamKarZarar: 50,
      toplamKarZararYuzde: 5,
    });
  });

  it('fiyat kaydı olmayan hisseyi son işlem fiyatıyla dahil eder', () => {
    const portfoy = [hisse('A', 5, 100), hisse('B', 5, 100, 90)];
    const ozet = portfoyOzeti(portfoy, { A: 120 });
    expect(ozet.toplamPortfoyDegeri).toBe(1050);
    expect(ozet.toplamKarZarar).toBe(50);
  });
});

describe('gerceklesenKarZarar', () => {
  it('kârlı satışı ortalama maliyete göre hesaplar', () => {
    expect(gerceklesenKarZarar(hisse('A', 5, 100), 120, 2)).toBe(40);
  });

  it('zararlı satışı negatif hesaplar', () => {
    expect(gerceklesenKarZarar(hisse('A', 5, 100), 80, 3)).toBe(-60);
  });

  it('ek alım sonrası ağırlıklı ortalama maliyeti kullanır', () => {
    const portfoy = alimUygula([hisse('A', 2, 120)], { sembol: 'A' }, 2, 150);
    expect(gerceklesenKarZarar(portfoy[0], 145, 2)).toBe(20);
  });
});

describe('islemKaydi', () => {
  it('kaydı verilen değerlerle oluşturur ve tutarı hesaplar', () => {
    const kayit = islemKaydi('AL', 'A', 3, 120, new Date(1000));
    expect(kayit).toMatchObject({ id: 1000, tip: 'AL', sembol: 'A', lot: 3, fiyat: 120, tutar: 360 });
    expect(gecerliIslemKaydi(kayit)).toBe(true);
  });
});

describe('tutarCoz', () => {
  it('pozitif tutarları ve kuruşları kabul eder', () => {
    expect(tutarCoz('1000')).toBe(1000);
    expect(tutarCoz('10.5')).toBe(10.5);
    expect(tutarCoz('0.01')).toBe(0.01);
  });

  it.each(['0', '-5', '', 'abc', '1.234', 'Infinity'])('%s değerini reddeder', (deger) => {
    expect(tutarCoz(deger)).toBeNull();
  });
});

describe('nakit hareketleri', () => {
  it('yeni hareketi başa ekler, eski listeyi değiştirmez', () => {
    const eski = [nakitHareketi('YATIRMA', 100, 'ilk')];
    const sonuc = paraYatir(eski, 50);
    expect(sonuc).toHaveLength(2);
    expect(sonuc[0]).toMatchObject({ tip: 'YATIRMA', tutar: 50, aciklama: 'Simülasyon' });
    expect(eski).toHaveLength(1);
  });

  it('para girişinin kaynağı değiştirilebilir', () => {
    expect(paraYatir([], 50, 'Banka')[0].aciklama).toBe('Banka');
  });

  it('kaydı verilen zamanla oluşturur ve tutarı kuruşa yuvarlar', () => {
    const zaman = new Date(1000);
    expect(nakitHareketi('ALIM', -186.30000000000001, 'A', zaman)).toMatchObject({ id: 1000, tutar: -186.3 });
  });

  it('kayıtları doğrular', () => {
    expect(gecerliNakitKaydi({ tip: 'YATIRMA', tutar: 1 })).toBe(true);
    expect(gecerliNakitKaydi({ tip: 'YATIRMA', tutar: 'x' })).toBe(false);
    expect(gecerliNakitKaydi({ tutar: 1 })).toBe(false);
    expect(gecerliNakitKaydi(1)).toBe(false);
  });
});

describe('bakiyeHesapla', () => {
  it('boş listede sıfır döner', () => {
    expect(bakiyeHesapla([])).toBe(0);
  });

  it('giriş ve çıkışları toplar', () => {
    expect(bakiyeHesapla([{ tutar: 10000 }, { tutar: -3156 }, { tutar: 1300 }])).toBe(8144);
  });

  it('kayan nokta hatası bırakmaz', () => {
    expect(bakiyeHesapla([{ tutar: 0.1 }, { tutar: 0.2 }])).toBe(0.3);
  });
});

describe('yeterliBakiyeVarMi', () => {
  it('bakiye tutara eşit veya büyükse kabul eder', () => {
    expect(yeterliBakiyeVarMi(100, 100)).toBe(true);
    expect(yeterliBakiyeVarMi(100, 99.99)).toBe(true);
  });

  it('bakiye yetersizse reddeder', () => {
    expect(yeterliBakiyeVarMi(100, 100.01)).toBe(false);
    expect(yeterliBakiyeVarMi(0, 1)).toBe(false);
  });

  it('kayan nokta farkı yüzünden tüm bakiyeyle alımı engellemez', () => {
    expect(yeterliBakiyeVarMi(0.3, 0.1 + 0.2)).toBe(true);
  });
});

describe('pastaRengi', () => {
  it('100 hisse için de her rengi farklı verir', () => {
    const renkler = Array.from({ length: 100 }, (_, i) => pastaRengi(i));
    expect(new Set(renkler).size).toBe(100);
  });

  it('aynı sıraya her zaman aynı rengi verir', () => {
    expect(pastaRengi(3)).toBe(pastaRengi(3));
    expect(pastaRengi(50)).toBe(pastaRengi(50));
  });
});

describe('kaydiOlmayanHisseler', () => {
  const al = (sembol, lot, id = 1) => ({ id, tip: 'AL', sembol, lot });
  const sat = (sembol, lot, id = 2) => ({ id, tip: 'SAT', sembol, lot });

  it('hiç kaydı olmayan hisseyi döner', () => {
    expect(kaydiOlmayanHisseler([hisse('A', 5, 1)], [])).toEqual(['A']);
  });

  it('lotu kayıtlardan fazla olan hisseyi döner', () => {
    expect(kaydiOlmayanHisseler([hisse('A', 5, 1)], [al('A', 3)])).toEqual(['A']);
  });

  it('kayıtları tam olan hisseyi döndürmez', () => {
    expect(kaydiOlmayanHisseler([hisse('A', 5, 1), hisse('B', 2, 1)], [al('A', 8), sat('A', 3), al('B', 2)])).toEqual([]);
  });

  it('işlemleri listedeki sıraya değil, tarihe göre değerlendirir', () => {
    expect(kaydiOlmayanHisseler([hisse('A', 5, 1)], [sat('A', 3, 2), al('A', 8, 1)])).toEqual([]);
  });
});

describe('grafikSembolleri', () => {
  it('portföy ve işlem geçmişindeki hisseleri tekil ve sıralı döner', () => {
    expect(grafikSembolleri([hisse('C', 1, 1), hisse('A', 1, 1)], [{ sembol: 'B' }, { sembol: 'A' }])).toBe('A,B,C');
  });

  it('hiç hisse yoksa boş döner', () => {
    expect(grafikSembolleri([], [])).toBe('');
  });

  it('lot değişince değişmez', () => {
    expect(grafikSembolleri([hisse('A', 1, 1)], [])).toBe(grafikSembolleri([hisse('A', 9, 1)], []));
  });
});

describe('kayıt doğrulama', () => {
  it('sağlam portföy kaydını kabul eder', () => {
    expect(gecerliPortfoyKaydi(hisse('A', 5, 100))).toBe(true);
  });

  it.each([[1], [null], [{}], [{ sembol: 'A', lot: 'x', maliyet: 1, fiyat: 1 }]])('bozuk portföy kaydını reddeder: %j', (kayit) => {
    expect(gecerliPortfoyKaydi(kayit)).toBe(false);
  });

  it('işlem kaydını doğrular', () => {
    expect(gecerliIslemKaydi({ sembol: 'A', lot: 1, fiyat: 1, tutar: 1 })).toBe(true);
    expect(gecerliIslemKaydi({ sembol: 'A', lot: 1, fiyat: 1 })).toBe(false);
  });
});

describe('kayitliListeyiOku', () => {
  const kayitla = (deger) => vi.stubGlobal('localStorage', { getItem: () => deger });

  afterEach(() => vi.unstubAllGlobals());

  it.each(['{bozuk', '{"a":1}', '5', null])('%s kaydında boş liste döner', (deger) => {
    kayitla(deger);
    expect(kayitliListeyiOku('anahtar', gecerliPortfoyKaydi)).toEqual([]);
  });

  it('geçersiz satırları atar, sağlamları korur', () => {
    const saglam = hisse('A', 5, 100);
    kayitla(JSON.stringify([1, saglam, {}]));
    expect(kayitliListeyiOku('anahtar', gecerliPortfoyKaydi)).toEqual([saglam]);
  });
});

//Backend'e gönderilen işlemler, canlı son nokta ve dönem kesme testleri.
describe('analizIslemleri', () => {
  const kayit = (id, tip, sembol, lot, fiyat) => ({ id, tip, sembol, lot, fiyat, tutar: lot * fiyat });

  it('işlemleri eskiden yeniye sıralar ve backend biçimine çevirir', () => {
    const sonraki = Date.UTC(2026, 9, 1, 8, 0);
    const onceki = Date.UTC(2026, 9, 1, 7, 0);
    expect(analizIslemleri([kayit(sonraki, 'SAT', 'A', 2, 12), kayit(onceki, 'AL', 'A', 5, 10)])).toEqual([
      { date: '2026-10-01T10:00:00', ticker: 'A.IS', type: 'BUY', quantity: 5, price: 10 },
      { date: '2026-10-01T11:00:00', ticker: 'A.IS', type: 'SELL', quantity: 2, price: 12 },
    ]);
  });

  it('tarihi İstanbul saatine göre yazar', () => {
    const [islem] = analizIslemleri([kayit(Date.UTC(2026, 9, 1, 22, 0), 'AL', 'A', 1, 10)]);
    expect(islem.date).toBe('2026-10-02T01:00:00');
  });

  it('backend tarafından reddedilecek bozuk kayıtları atar', () => {
    expect(analizIslemleri([kayit(undefined, 'AL', 'A', 1, 10), kayit(1, 'AL', 'A', 0, 10), kayit(2, 'AL', 'A', 1, 0)])).toEqual([]);
  });
});

describe('analiziCanlandir', () => {
  const gun = (date, portfolio_value) => ({
    date,
    portfolio_value,
    total_invested: 1000,
    unrealized_pnl: portfolio_value - 1000,
    unrealized_return_pct: (portfolio_value - 1000) / 10,
    realized_pnl: 50,
    held_invested: 1000,
    held_pnl: portfolio_value - 1000,
    held_return_pct: (portfolio_value - 1000) / 10,
  });
  const analiz = {
    summary: gun('2026-10-02', 1100),
    positions: [{ ticker: 'A.IS', lots: 10, wac: 100, last_price: 110 }],
    series: [gun('2026-10-01', 1000), gun('2026-10-02', 1100)],
    warnings: { rejected_sales: [], missing_prices: [] },
  };

  it('yalnızca son günü ve özeti canlı fiyatla günceller', () => {
    const sonuc = analiziCanlandir(analiz, { A: 120 });
    expect(sonuc.series[0]).toEqual(analiz.series[0]);
    expect(sonuc.series[1]).toEqual({ ...gun('2026-10-02', 1200), unrealized_pnl: 200, unrealized_return_pct: 20, held_pnl: 200, held_return_pct: 20 });
    expect(sonuc.summary).toEqual(sonuc.series[1]);
  });

  it('canlı fiyat yoksa backend fiyatını kullanır', () => {
    expect(analiziCanlandir(analiz, {}).summary.portfolio_value).toBe(1100);
  });

  it('maliyet sıfırsa getiri sıfır olur', () => {
    const satilmis = {
      ...analiz,
      positions: [],
      series: [{ ...gun('2026-10-02', 0), total_invested: 0, unrealized_pnl: 0, unrealized_return_pct: 0 }],
    };
    expect(analiziCanlandir(satilmis, { A: 120 }).summary.unrealized_return_pct).toBe(0);
  });

  it('veri yoksa veya seri boşsa aynen döner', () => {
    const bos = { summary: null, positions: [], series: [], warnings: {} };
    expect(analiziCanlandir(null, {})).toBeNull();
    expect(analiziCanlandir(bos, {})).toBe(bos);
  });
});

describe('seriyiDonemeGoreKes', () => {
  const seri = ['2026-01-01', '2026-09-30', '2026-10-01', '2026-10-25', '2026-10-31'].map(date => ({ date }));

  it('son tarihten geriye dönem kadar gün bırakır', () => {
    expect(seriyiDonemeGoreKes(seri, '1a').map(n => n.date)).toEqual(['2026-10-01', '2026-10-25', '2026-10-31']);
    expect(seriyiDonemeGoreKes(seri, '1h').map(n => n.date)).toEqual(['2026-10-25', '2026-10-31']);
  });

  // Gün içi seriler backend'den dönemine göre kesilmiş gelir, 1G tekrar kesilmez.
  it('1G serisine dokunmaz', () => {
    expect(seriyiDonemeGoreKes(seri, '1g')).toEqual(seri);
  });

  it('boş seride çökmez', () => {
    expect(seriyiDonemeGoreKes([], '3a')).toEqual([]);
  });
});

// Kapalı günlerin grafikten çıkarılması.
describe('kapaliGunleriCikar', () => {
  const gun = (date, portfolio_value, total_invested = 100, realized_pnl = 0) => ({ date, portfolio_value, total_invested, realized_pnl });
  const tarihler = (seri) => kapaliGunleriCikar(seri).map(n => n.date);

  it('önceki günle aynı olan günleri çıkarır', () => {
    expect(tarihler([gun('2026-10-02', 110), gun('2026-10-03', 110), gun('2026-10-04', 110), gun('2026-10-05', 120)]))
      .toEqual(['2026-10-02', '2026-10-05']);
  });

  it('kapalı günde yapılan işlemi korur', () => {
    expect(tarihler([gun('2026-10-02', 110), gun('2026-10-03', 110, 150), gun('2026-10-04', 110, 150), gun('2026-10-05', 120, 150)]))
      .toEqual(['2026-10-02', '2026-10-03', '2026-10-05']);
    expect(tarihler([gun('2026-10-02', 110), gun('2026-10-03', 110, 100, 5), gun('2026-10-05', 120, 100, 5)]))
      .toEqual(['2026-10-02', '2026-10-03', '2026-10-05']);
  });

  it('değişmese de ilk ve son günü korur', () => {
    expect(tarihler([gun('2026-10-02', 110), gun('2026-10-03', 110), gun('2026-10-04', 110)])).toEqual(['2026-10-02', '2026-10-04']);
    expect(tarihler([gun('2026-10-02', 110)])).toEqual(['2026-10-02']);
    expect(tarihler([])).toEqual([]);
  });

  it('gün içi noktalara dokunmaz', () => {
    const seri = [gun('2026-10-02T10:00:00', 110), gun('2026-10-02T10:05:00', 110), gun('2026-10-02T10:10:00', 110)];
    expect(kapaliGunleriCikar(seri)).toEqual(seri);
  });
});

// Para gösterimi ve "En fazla" düğmesi.
describe('para gösterimi', () => {
  it('tutarı Türkçe biçimde yazar', () => {
    expect(tl(103027.5)).toBe('103.027,50 ₺');
  });

  it('pozitif değere artı ekler, sıfıra eklemez', () => {
    expect(isaretliTl(10)).toBe('+10,00 ₺');
    expect(isaretliTl(0)).toBe('0,00 ₺');
    expect(isaretliTl(-10)).toBe('-10,00 ₺');
    expect(isaretliYuzde(4.5)).toBe('+4,50%');
    expect(isaretliYuzde(-1.32)).toBe('-1,32%');
  });
});

describe('enFazlaLot', () => {
  it('alışta bakiyenin yettiği tam lotu verir', () => {
    expect(enFazlaLot('AL', 1000, 300, 0)).toBe(3);
    expect(enFazlaLot('AL', 900, 300, 0)).toBe(3);
    expect(enFazlaLot('AL', 100, 300, 0)).toBe(0);
  });

  it('satışta eldeki lotu verir', () => {
    expect(enFazlaLot('SAT', 0, 300, 25)).toBe(25);
    expect(enFazlaLot('SAT', 1000, 300, 0)).toBe(0);
  });

  it('fiyat veya bakiye geçersizse sıfır verir', () => {
    expect(enFazlaLot('AL', 1000, 0, 0)).toBe(0);
    expect(enFazlaLot('AL', -5, 300, 0)).toBe(0);
  });
});

// Seçili hissenin dönem değişimi.
describe('donemDegisimi', () => {
  const veri = [{ close: 200 }, { close: 210 }];

  it('ilk kapanışa göre yüzde değişimi kuruşa yuvarlar', () => {
    expect(donemDegisimi(veri, 220)).toBe(10);
    expect(donemDegisimi(veri, 190)).toBe(-5);
    expect(donemDegisimi([{ close: 3 }], 4)).toBe(33.33);
  });

  it('veri veya fiyat yoksa null döner', () => {
    expect(donemDegisimi([], 220)).toBeNull();
    expect(donemDegisimi([{ close: 0 }], 220)).toBeNull();
    expect(donemDegisimi(veri, undefined)).toBeNull();
  });
});

// Özet şeridindeki dönem kâr/zararı.
describe('donemKari', () => {
  const pozisyonlar = [
    { ticker: 'A.IS', lots: 10, reference: 1000 },
    { ticker: 'B.IS', lots: 5, reference: 500 },
  ];

  it('elde kalan lotların canlı değerini referansla karşılaştırır', () => {
    expect(donemKari(pozisyonlar, { A: 120, B: 90 })).toEqual({ tutar: 150, yuzde: 10 });
  });

  it('canlı fiyat yoksa son kapanışı kullanır', () => {
    expect(donemKari(pozisyonlar, { A: 120 }, { 'B.IS': 110 })).toEqual({ tutar: 250, yuzde: 16.67 });
  });

  it('hiç fiyat yoksa o hisse kâr veya zarar yazmaz', () => {
    expect(donemKari(pozisyonlar, { A: 100 })).toEqual({ tutar: 0, yuzde: 0 });
  });

  it('pozisyon yoksa sıfır döner', () => {
    expect(donemKari([], { A: 120 })).toEqual({ tutar: 0, yuzde: 0 });
  });
});

// Grafik ile üst şeridin aynı dönem başını kullanması.
describe('donemKarSerisi', () => {
  const nokta = (date, held_pnl, held_invested) => ({ date, held_pnl, held_invested });

  it('son nokta üstteki dönem kârıyla aynı olur, dönem başı sıfırdır', () => {
    const seri = [nokta('2026-10-01', 500, 1000), nokta('2026-10-02', 800, 1000)];
    const pozisyonlar = [{ ticker: 'A.IS', lots: 10, reference: 1500 }];
    const sonuc = donemKarSerisi(seri, pozisyonlar);
    expect(sonuc.map(n => n.donem_kari)).toEqual([0, 300]);
    expect(sonuc[1].donem_getiri).toBe(20);
    expect(sonuc[1].donem_kari).toBe(donemKari(pozisyonlar, { A: 180 }).tutar);
  });

  it('dönem içinde alınan lot alış fiyatından başlar', () => {
    const seri = [nokta('2026-10-01', 500, 1000), nokta('2026-10-02', 900, 1200)];
    const pozisyonlar = [{ ticker: 'A.IS', lots: 12, reference: 1700 }];
    expect(donemKarSerisi(seri, pozisyonlar).map(n => n.donem_kari)).toEqual([0, 400]);
  });

  it('bütün lotlar dönem içinde alındıysa toplam kâra eşit olur', () => {
    const sonuc = donemKarSerisi([nokta('2026-10-02', 100, 1000)], [{ ticker: 'A.IS', lots: 10, reference: 1000 }]);
    expect(sonuc[0].donem_kari).toBe(100);
  });

  it('seri boşsa veya elde lot yoksa çökmez', () => {
    expect(donemKarSerisi([], [])).toEqual([]);
    expect(donemKarSerisi([nokta('2026-10-02', 0, 0)], [])[0]).toMatchObject({ donem_kari: 0, donem_getiri: 0 });
  });
});

// 5Y grafiğinin ilk alımdan önceki kısmı.
describe('donemBasinaKadarDoldur', () => {
  const nokta = (date) => ({ date, portfolio_value: 10, held_pnl: 1 });

  it('dönem başından ilk alıma kadar hafta içi günleri sıfırla doldurur', () => {
    const seri = [nokta('2026-01-08'), nokta('2026-01-10')];
    const sonuc = donemBasinaKadarDoldur(seri, '1h');
    expect(sonuc.map(n => n.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-10']);
    expect(sonuc[0]).toMatchObject({ portfolio_value: 0, held_pnl: 0, held_invested: 0 });
  });

  it('seri dönem başından önce başlıyorsa dokunmaz', () => {
    const seri = [nokta('2025-01-01'), nokta('2026-01-10')];
    expect(donemBasinaKadarDoldur(seri, '1h')).toEqual(seri);
  });

  it('boş seride ve bilinmeyen dönemde çökmez', () => {
    expect(donemBasinaKadarDoldur([], '5y')).toEqual([]);
    expect(donemBasinaKadarDoldur([nokta('2026-01-10')], '1g')).toHaveLength(1);
  });
});

// Bölünme ve bedelsiz sermaye artırımı düzeltmesi.
describe('bolunmeleriUygula', () => {
  const ONCE = Date.UTC(2026, 4, 13, 8);
  const SONRA = Date.UTC(2026, 4, 15, 8);
  const kayit = (id, tip, lot, fiyat, ek = {}) => ({ id, tarih: '-', tip, sembol: 'BIMAS', lot, fiyat, tutar: lot * fiyat, ...ek });
  const bolunme = (oran, kapanis = 414) => ({ BIMAS: [{ tarih: '2026-05-14', oran, kapanis }] });
  const durum = (portfoy, islemler) => ({ portfoy, islemler, nakit: [], uygulananlar: [] });

  it('bölünmeden önceki işlemin lotunu çarpar, fiyatını böler, portföyü düzeltir', () => {
    const sonuc = bolunmeleriUygula(
      durum([{ sembol: 'BIMAS', lot: 10, maliyet: 700, fiyat: 700 }], [kayit(ONCE, 'AL', 10, 700)]),
      bolunme(2),
    );
    expect(sonuc.islemler).toEqual([{ ...kayit(ONCE, 'AL', 20, 350), tutar: 7000, bolunme: 2 }]);
    expect(sonuc.portfoy).toEqual([{ sembol: 'BIMAS', lot: 20, maliyet: 350, fiyat: 414 }]);
    expect(sonuc.nakit).toEqual([]);
    expect(sonuc.uygulananlar).toEqual(['BIMAS:2026-05-14']);
    expect(sonuc.islenenler).toEqual([{ sembol: 'BIMAS', tarih: '2026-05-14', oran: 2, kusurat: 0 }]);
  });

  it('küsurat lotu o günün kapanışından satar ve nakde ekler', () => {
    const sonuc = bolunmeleriUygula(
      durum([{ sembol: 'BIMAS', lot: 10, maliyet: 60, fiyat: 60 }], [kayit(ONCE, 'AL', 10, 60)]),
      bolunme(4.25, 15.65),
    );
    expect(sonuc.portfoy[0].lot).toBe(42);
    expect(sonuc.portfoy[0].maliyet).toBeCloseTo(600 / 42.5, 8);
    const kusurat = sonuc.islemler.find(islem => islem.kusurat);
    expect(kusurat).toMatchObject({ tip: 'SAT', lot: 0.5, fiyat: 15.65, id: Date.UTC(2026, 4, 14, 7) });
    expect(kusurat.karZarar).toBeCloseTo((15.65 - 600 / 42.5) * 0.5, 8);
    expect(sonuc.nakit).toHaveLength(1);
    expect(sonuc.nakit[0]).toMatchObject({ tip: 'KÜSURAT', aciklama: 'BIMAS bölünme küsuratı' });
    expect(sonuc.nakit[0].tutar).toBeCloseTo(7.83, 2);
    expect(sonuc.islenenler[0].kusurat).toBe(0.5);
  });

  it('bölünmeden sonra eski fiyatla yapılan satışın kârını düzeltir, kalan bedelsiz lotlar portföye eklenir', () => {
    const sonuc = bolunmeleriUygula(
      durum([], [kayit(SONRA, 'SAT', 10, 414, { karZarar: -2860 }), kayit(ONCE, 'AL', 10, 700)]),
      bolunme(2),
    );
    expect(sonuc.islemler.find(islem => islem.id === SONRA).karZarar).toBe(640);
    expect(sonuc.portfoy).toEqual([{ sembol: 'BIMAS', lot: 10, maliyet: 350, fiyat: 414 }]);
  });

  it('aynı bölünmeyi ikinci kez uygulamaz', () => {
    const ilk = bolunmeleriUygula(
      durum([{ sembol: 'BIMAS', lot: 10, maliyet: 700, fiyat: 700 }], [kayit(ONCE, 'AL', 10, 700)]),
      bolunme(2),
    );
    expect(bolunmeleriUygula({ ...ilk, nakit: ilk.nakit }, bolunme(2))).toBeNull();
  });

  it('bölünmeden önce işlem yoksa kayıtlara dokunmaz, yalnızca işlendi sayar', () => {
    const portfoy = [{ sembol: 'BIMAS', lot: 10, maliyet: 400, fiyat: 400 }];
    const islemler = [kayit(SONRA, 'AL', 10, 400)];
    const sonuc = bolunmeleriUygula(durum(portfoy, islemler), bolunme(2));
    expect(sonuc.portfoy).toBe(portfoy);
    expect(sonuc.islemler).toEqual(islemler);
    expect(sonuc.uygulananlar).toEqual(['BIMAS:2026-05-14']);
    expect(sonuc.islenenler).toEqual([]);
  });

  it('portföy işlem kayıtlarıyla uyuşmuyorsa dokunmaz', () => {
    const sonuc = bolunmeleriUygula(
      durum([{ sembol: 'BIMAS', lot: 15, maliyet: 700, fiyat: 700 }], [kayit(ONCE, 'AL', 10, 700)]),
      bolunme(2),
    );
    expect(sonuc).toBeNull();
  });

  it('Yahoonun tam sayıya çok yakın oranlarını yuvarlar', () => {
    expect(bolunmeOrani(18.999012)).toBe(19);
    expect(bolunmeOrani(4.25)).toBe(4.25);
  });
});

// Tanıtım için örnek portföy.
describe('demoPortfoyuOlustur', () => {
  // 70 işlem günü, her gün fiyat 1 artar. Son gün 2026-11-20.
  const mumlar = (baslangic) => Array.from({ length: 70 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 10, 20) - (69 - i) * 86400000).toISOString().slice(0, 10),
    close: baslangic + i,
  }));
  const plan = [
    { gun: 60, tip: 'AL', sembol: 'AAA', lot: 10 },
    { gun: 10, tip: 'SAT', sembol: 'AAA', lot: 4 },
    { gun: 5, tip: 'AL', sembol: 'BBB', lot: 1000 },
  ];

  it('plandaki günlerin kapanışıyla işlem yapar, satışın kârını ve nakdi hesaplar', () => {
    const sonuc = demoPortfoyuOlustur({ AAA: mumlar(100), BBB: mumlar(50) }, plan, 2000);
    const alis = sonuc.islemler.find(islem => islem.tip === 'AL');
    const satis = sonuc.islemler.find(islem => islem.tip === 'SAT');
    expect(alis).toMatchObject({ sembol: 'AAA', lot: 10, fiyat: 109, id: Date.UTC(2026, 8, 21, 8, 0) });
    expect(satis).toMatchObject({ sembol: 'AAA', lot: 4, fiyat: 159, karZarar: 200 });
    expect(sonuc.portfoy).toEqual([{ sembol: 'AAA', fiyat: 109, lot: 6, maliyet: 109 }]);
    expect(sonuc.nakit.map(h => h.tip)).toEqual(['SATIM', 'ALIM', 'YATIRMA']);
    expect(sonuc.nakit.reduce((toplam, h) => toplam + h.tutar, 0)).toBe(2000 - 1090 + 636);
  });

  it('bakiyesi yetmeyen alımı atlar', () => {
    const sonuc = demoPortfoyuOlustur({ AAA: mumlar(100), BBB: mumlar(50) }, plan, 2000);
    expect(sonuc.islemler.some(islem => islem.sembol === 'BBB')).toBe(false);
  });

  it('verisi olmayan hisseyi atlar, hiç veri yoksa null döner', () => {
    expect(demoPortfoyuOlustur({ AAA: mumlar(100) }, plan, 2000).islemler).toHaveLength(2);
    expect(demoPortfoyuOlustur({}, plan, 2000)).toBeNull();
  });

  it('kayıtlar yeniden eskiye sıralıdır', () => {
    const { islemler, nakit } = demoPortfoyuOlustur({ AAA: mumlar(100), BBB: mumlar(50) }, plan, 100000);
    expect(islemler.map(islem => islem.id)).toEqual([...islemler.map(islem => islem.id)].sort((a, b) => b - a));
    expect(nakit[nakit.length - 1].tip).toBe('YATIRMA');
  });
});
