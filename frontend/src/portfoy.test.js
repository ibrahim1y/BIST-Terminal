import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alimUygula,
  gecerliIslemKaydi,
  gecerliPortfoyKaydi,
  karZararHesapla,
  kayitliListeyiOku,
  lotMiktariniCoz,
  portfoyOzeti,
  satimUygula,
  sonFiyatBul,
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
