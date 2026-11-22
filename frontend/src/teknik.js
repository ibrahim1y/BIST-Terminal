// Hisse grafiğindeki teknik göstergeler. Her fonksiyon kapanış dizisiyle aynı uzunlukta dizi döner,
// hesaplanamayan başlangıç noktaları null olur.

// Basit hareketli ortalama: son n kapanışın ortalaması.
export const sma = (degerler, n) => degerler.map((_, i) => {
  if (i < n - 1) return null;
  let toplam = 0;
  for (let j = i - n + 1; j <= i; j++) toplam += degerler[j];
  return toplam / n;
});

// Üssel hareketli ortalama: ilk değer n günlük basit ortalamadır, sonrası 2 / (n + 1) ağırlıkla güncellenir.
export const ema = (degerler, n) => {
  const sonuc = new Array(degerler.length).fill(null);
  if (degerler.length < n) return sonuc;
  const k = 2 / (n + 1);
  let onceki = degerler.slice(0, n).reduce((a, b) => a + b, 0) / n;
  sonuc[n - 1] = onceki;
  for (let i = n; i < degerler.length; i++) {
    onceki = degerler[i] * k + onceki * (1 - k);
    sonuc[i] = onceki;
  }
  return sonuc;
};

// Bollinger bantları: n günlük ortalama ve onun k standart sapma üstü ve altı.
export const bollinger = (degerler, n = 20, k = 2) => {
  const orta = sma(degerler, n);
  const ust = [];
  const alt = [];
  orta.forEach((ortalama, i) => {
    if (ortalama === null) {
      ust.push(null);
      alt.push(null);
      return;
    }
    let kareler = 0;
    for (let j = i - n + 1; j <= i; j++) kareler += (degerler[j] - ortalama) ** 2;
    const sapma = Math.sqrt(kareler / n);
    ust.push(ortalama + k * sapma);
    alt.push(ortalama - k * sapma);
  });
  return { orta, ust, alt };
};

// RSI: Wilder yöntemiyle ortalama kazancın ortalama kayba oranından 0-100 arası güç endeksi.
export const rsi = (degerler, n = 14) => {
  const sonuc = new Array(degerler.length).fill(null);
  if (degerler.length <= n) return sonuc;
  let kazanc = 0;
  let kayip = 0;
  for (let i = 1; i <= n; i++) {
    const fark = degerler[i] - degerler[i - 1];
    if (fark > 0) kazanc += fark; else kayip -= fark;
  }
  kazanc /= n;
  kayip /= n;
  const deger = () => (kayip === 0 ? 100 : 100 - 100 / (1 + kazanc / kayip));
  sonuc[n] = deger();
  for (let i = n + 1; i < degerler.length; i++) {
    const fark = degerler[i] - degerler[i - 1];
    kazanc = (kazanc * (n - 1) + Math.max(fark, 0)) / n;
    kayip = (kayip * (n - 1) + Math.max(-fark, 0)) / n;
    sonuc[i] = deger();
  }
  return sonuc;
};

// MACD: 12 ve 26 günlük EMA farkı, onun 9 günlük EMA'sı (sinyal) ve aradaki fark (histogram).
export const macd = (degerler, kisa = 12, uzun = 26, sinyalN = 9) => {
  const kisaEma = ema(degerler, kisa);
  const uzunEma = ema(degerler, uzun);
  const cizgi = degerler.map((_, i) => (kisaEma[i] === null || uzunEma[i] === null ? null : kisaEma[i] - uzunEma[i]));
  const ilk = cizgi.findIndex(v => v !== null);
  const sinyal = new Array(degerler.length).fill(null);
  if (ilk !== -1) {
    ema(cizgi.slice(ilk), sinyalN).forEach((v, i) => { sinyal[ilk + i] = v; });
  }
  const histogram = cizgi.map((v, i) => (v === null || sinyal[i] === null ? null : v - sinyal[i]));
  return { macd: cizgi, sinyal, histogram };
};
