import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alimUygula,
  bakiyeHesapla,
  gecerliIslemKaydi,
  gecerliNakitKaydi,
  gecerliPortfoyKaydi,
  gerceklesenKarZarar,
  islemKaydi,
  karZararHesapla,
  kayitliListeyiOku,
  lotMiktariniCoz,
  nakitHareketi,
  paraYatir,
  pastaRengi,
  portfoyDegerSerisi,
  portfoyOzeti,
  satimUygula,
  sonFiyatBul,
  toplamGerceklesenKarZarar,
  tutarCoz,
  veriOlmayanHisseler,
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

describe('toplamGerceklesenKarZarar', () => {
  it('boş geçmişte sıfır döner', () => {
    expect(toplamGerceklesenKarZarar([])).toBe(0);
  });

  it('kâr ve zararları toplar', () => {
    expect(toplamGerceklesenKarZarar([{ karZarar: 40 }, { karZarar: -60 }, { karZarar: 5 }])).toBe(-15);
  });

  it('alımları, eski satışları ve geçersiz değerleri atlar', () => {
    const gecmis = [{ tip: 'AL' }, { tip: 'SAT' }, { tip: 'SAT', karZarar: 'x' }, { tip: 'SAT', karZarar: null }, { tip: 'SAT', karZarar: 10 }];
    expect(toplamGerceklesenKarZarar(gecmis)).toBe(10);
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

describe('portfoyDegerSerisi', () => {
  const portfoy = [hisse('A', 5, 100), hisse('B', 2, 50)];

  it('her tarih için fiyatları bugünkü lotlarla çarpıp toplar', () => {
    const satirlar = [
      { time: '2026-01-01', fiyatlar: { A: 10, B: 20 } },
      { time: '2026-01-02', fiyatlar: { A: 12, B: 25 } },
    ];
    expect(portfoyDegerSerisi(portfoy, satirlar).map(s => [s.time, s.close])).toEqual([
      ['2026-01-01', 90],
      ['2026-01-02', 110],
    ]);
  });

  it('grafik bileşeninin beklediği alanların hepsini doldurur', () => {
    expect(portfoyDegerSerisi(portfoy, [{ time: 1000, fiyatlar: { A: 10, B: 20 } }])[0]).toEqual({
      time: 1000,
      open: 90,
      high: 90,
      low: 90,
      close: 90,
    });
  });

  it('verisi olmayan hisseyi toplama katmaz', () => {
    expect(portfoyDegerSerisi(portfoy, [{ time: 1, fiyatlar: { A: 10 } }])[0].close).toBe(50);
  });

  it('değeri kuruşa yuvarlar', () => {
    expect(portfoyDegerSerisi([hisse('A', 3, 1)], [{ time: 1, fiyatlar: { A: 0.1 } }])[0].close).toBe(0.3);
  });

  it('boş veride boş seri döner', () => {
    expect(portfoyDegerSerisi(portfoy, [])).toEqual([]);
  });
});

describe('veriOlmayanHisseler', () => {
  const portfoy = [hisse('A', 5, 100), hisse('B', 2, 50)];

  it('verisi gelmeyen sembolleri döner', () => {
    expect(veriOlmayanHisseler(portfoy, [{ time: 1, fiyatlar: { A: 10 } }])).toEqual(['B']);
  });

  it('hepsinin verisi varsa boş döner', () => {
    expect(veriOlmayanHisseler(portfoy, [{ time: 1, fiyatlar: { A: 10, B: 20 } }])).toEqual([]);
  });

  it('hiç veri yoksa boş döner', () => {
    expect(veriOlmayanHisseler(portfoy, [])).toEqual([]);
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
