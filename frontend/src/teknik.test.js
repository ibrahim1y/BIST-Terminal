// Teknik gösterge hesaplarının testleri.
import { describe, expect, it } from 'vitest';
import { bollinger, ema, macd, rsi, sma } from './teknik';

const yakin = (dizi, basamak = 4) => dizi.map(v => (v === null ? null : Number(v.toFixed(basamak))));

describe('sma', () => {
  it('son n değerin ortalamasını verir, başı null olur', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe('ema', () => {
  it('ilk değer basit ortalama, sonrası 2/(n+1) ağırlıklı', () => {
    expect(yakin(ema([1, 2, 3, 4, 5], 3))).toEqual([null, null, 2, 3, 4]);
    expect(yakin(ema([2, 4, 6, 10], 3))).toEqual([null, null, 4, 7]);
  });

  it('veri n den kısaysa hepsi null', () => {
    expect(ema([1, 2], 3)).toEqual([null, null]);
  });
});

describe('bollinger', () => {
  it('ortalamanın iki standart sapma üstünü ve altını verir', () => {
    const { orta, ust, alt } = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(orta[7]).toBe(5);
    expect(ust[7]).toBe(9);
    expect(alt[7]).toBe(1);
    expect(ust[6]).toBeNull();
  });
});

describe('rsi', () => {
  it('sürekli yükselişte 100, sürekli düşüşte 0 olur', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3).slice(3)).toEqual([100, 100, 100]);
    expect(rsi([6, 5, 4, 3, 2, 1], 3).slice(3)).toEqual([0, 0, 0]);
  });

  it('eşit kazanç ve kayıpta 50 olur', () => {
    expect(rsi([10, 11, 10, 11, 10], 4)[4]).toBe(50);
  });

  it('başı null olur', () => {
    expect(rsi([1, 2, 3, 4], 3).slice(0, 3)).toEqual([null, null, null]);
  });
});

describe('macd', () => {
  it('kısa ve uzun EMA farkını, sinyali ve histogramı verir', () => {
    const degerler = Array.from({ length: 40 }, (_, i) => 100 + i);
    const { macd: cizgi, sinyal, histogram } = macd(degerler);
    expect(cizgi[24]).toBeNull();
    expect(cizgi[25]).toBeCloseTo(7, 5);
    expect(sinyal[32]).toBeNull();
    expect(sinyal[33]).toBeCloseTo(7, 5);
    expect(histogram[39]).toBeCloseTo(0, 5);
  });

  it('kısa veride hata vermez', () => {
    const { macd: cizgi, sinyal } = macd([1, 2, 3]);
    expect(cizgi).toEqual([null, null, null]);
    expect(sinyal).toEqual([null, null, null]);
  });
});
