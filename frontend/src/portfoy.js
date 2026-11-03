//Kayıt bozuksa veya liste değilse uygulama çökmeyecek, boş liste dönecek. Geçersiz satırlar atılacak.
export const gecerliPortfoyKaydi = k => typeof k?.sembol === 'string' && [k.lot, k.maliyet, k.fiyat].every(Number.isFinite);
export const gecerliIslemKaydi = k => typeof k?.sembol === 'string' && [k.lot, k.fiyat, k.tutar].every(Number.isFinite);
export const kayitliListeyiOku = (anahtar, gecerliMi) => {
  try {
    const veri = JSON.parse(localStorage.getItem(anahtar));
    return Array.isArray(veri) ? veri.filter(gecerliMi) : [];
  } catch {
    return [];
  }
};

//Geçerli lot miktarını döndürür, geçersizse null döndürür.
export const lotMiktariniCoz = (metin) => {
  const miktar = Number(metin);
  return Number.isInteger(miktar) && miktar > 0 ? miktar : null;
};

// Alım sonrası yeni portföyü döndürür.
export const alimUygula = (portfoy, hisse, miktar, fiyat) => {
  const mevcutHisse = portfoy.find(p => p.sembol === hisse.sembol);//Portföyde zaten var mı?
  if (mevcutHisse) {
    return portfoy.map(p => {
      if (p.sembol === hisse.sembol) {
        const yeniLot = p.lot + miktar;//Eski lot sayısına ekle
        //Ortalama maliyet onay anındaki fiyatla hesaplanır.
        const yeniMaliyet = ((p.lot * p.maliyet) + (miktar * fiyat)) / yeniLot;
        return { ...p, lot: yeniLot, maliyet: yeniMaliyet };
      }
      return p;
    });
  }
  return [...portfoy, { ...hisse, fiyat, lot: miktar, maliyet: fiyat }];
};

//Satım sonrası yeni portföyü döndürür, lot yetersizse null döndürür.
export const satimUygula = (portfoy, sembol, miktar) => {
  const mevcutHisse = portfoy.find(p => p.sembol === sembol);//Portföyde var mı?
  if (!mevcutHisse || mevcutHisse.lot < miktar)//Yeterli lot var mı kontrolü
  {
    return null;
  }

  //Lotların tamamı satılıyorsa portföyden çıkar, aksi takdirde lot sayısını güncelle.
  if (mevcutHisse.lot === miktar) {
    return portfoy.filter(p => p.sembol !== sembol);
  }
  return portfoy.map(p => p.sembol === sembol ? { ...p, lot: p.lot - miktar } : p);
};

//En son alınan fiyatı, kayıt yoksa son işlem fiyatını döndürür.
export const sonFiyatBul = (item, sonFiyatlar) => sonFiyatlar[item.sembol] ?? item.fiyat;

//Tek hissenin kâr/zararını hesaplar.
export const karZararHesapla = (item, fiyat) => ({
  karZarar: (fiyat - item.maliyet) * item.lot,
  karZararYuzde: ((fiyat - item.maliyet) / item.maliyet) * 100
});

//Bir satışın gerçekleşen kâr/zararını ortalama maliyete göre hesaplayacak.
export const gerceklesenKarZarar = (item, satisFiyati, miktar) => (satisFiyati - item.maliyet) * miktar;

//Geçmişteki gerçekleşen kâr/zararları toplar; bilgisi olmayan kayıtlar atlanır.
export const toplamGerceklesenKarZarar = (islemGecmisi) =>
  islemGecmisi.reduce((toplam, islem) => toplam + (Number.isFinite(islem.karZarar) ? islem.karZarar : 0), 0);

//İşlem kaydı App.jsx'ten buraya taşındı.
export const islemKaydi = (tip, sembol, lot, fiyat, zaman = new Date()) => ({
  id: zaman.getTime(),
  tarih: zaman.toLocaleString('tr-TR'),
  tip,
  sembol,
  lot,
  fiyat,
  tutar: lot * fiyat
});

//Para tutarlarını kuruşa yuvarlar.
const kurusaYuvarla = (tutar) => Math.round(tutar * 100) / 100;

//Nakit hareketi kaydının geçerliliğini kontrol eder.
export const gecerliNakitKaydi = k => typeof k?.tip === 'string' && Number.isFinite(k.tutar);

//Girilen tutarı döndürür; pozitif değilse veya kuruştan küçük basamak varsa null dönmeli.
export const tutarCoz = (metin) => {
  const tutar = Number(metin);
  return Number.isFinite(tutar) && tutar > 0 && kurusaYuvarla(tutar) === tutar ? tutar : null;
};

//Yeni nakit hareketi kaydı oluşturur. Para çıkışında tutar negatiftir.
export const nakitHareketi = (tip, tutar, aciklama, zaman = new Date()) => ({
  id: zaman.getTime(),
  tarih: zaman.toLocaleString('tr-TR'),
  tip,
  tutar: kurusaYuvarla(tutar),
  aciklama
});

//Para girişinin tek noktası. Banka uygulaması bağlanınca kaynak burada değişecek.
export const paraYatir = (hareketler, tutar, kaynak = 'Simülasyon') => [nakitHareketi('YATIRMA', tutar, kaynak), ...hareketler];

//Bakiye tek bir sayı olarak tutulmamalı, nakit hareketlerinden hesaplanmalı.
export const bakiyeHesapla = (hareketler) => kurusaYuvarla(hareketler.reduce((toplam, h) => toplam + h.tutar, 0));

//Bakiye ve tutar kontrolü.
export const yeterliBakiyeVarMi = (bakiye, tutar) => bakiye >= kurusaYuvarla(tutar);

//Pasta grafiği renklerine ekleme yapıldı. Yan yana gelen renklerin aynı olması sorunu çözüldü.
const RENKLER = [
  '#34d399', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e', '#84cc16', '#06b6d4', '#f97316',
  '#a855f7', '#eab308', '#0ea5e9', '#d946ef', '#22c55e', '#ef4444', '#6366f1', '#facc15', '#fb7185', '#c084fc'
];

//Her ihtimale karşı gerektiğinde yeni renk üretimi için. Renkler başa dönüp aynı renkler gelmesin diye.
export const pastaRengi = (index) => RENKLER[index] ?? `hsl(${(index * 137.508) % 360}, 70%, 55%)`;

//Satır zamanları İstanbul saatine göre gelir, işlem zamanları da aynı saate çevrilerek karşılaştırılır.
const ISTANBUL_FARKI_MS = 3 * 60 * 60 * 1000;
const satirBaslangici = (time) => (typeof time === 'number' ? time * 1000 : Date.parse(time));

// Her tarih o tarihteki lotlarla hesaplanır. Bugünkü lotlardan başlanıp geriye gidilir, satırın bitişinden sonraki işlemler geri alınır.
// Son satır güncel fiyatları kullanır. İlk alımdan önceki tarihler seriye girmez.
export const portfoyDegerSerisi = (portfoy, islemler, satirlar, sonFiyatlar) => {
  const lotlar = Object.fromEntries(portfoy.map(item => [item.sembol, item.lot]));
  const sonIslemdenIlke = islemler.filter(islem => Number.isFinite(islem.id)).sort((a, b) => b.id - a.id);
  const verisiOlanlar = new Set(satirlar.flatMap(satir => Object.keys(satir.fiyatlar)));
  const seri = [];
  let sira = 0;

  for (let i = satirlar.length - 1; i >= 0; i--) {
    const sonSatir = i === satirlar.length - 1;

    if (!sonSatir) {
      const bitis = satirBaslangici(satirlar[i + 1].time);
      while (sira < sonIslemdenIlke.length && sonIslemdenIlke[sira].id + ISTANBUL_FARKI_MS >= bitis) {
        const { tip, sembol, lot } = sonIslemdenIlke[sira];
        lotlar[sembol] = (lotlar[sembol] ?? 0) + (tip === 'SAT' ? lot : -lot);
        sira++;
      }
    }

    const { time, fiyatlar } = satirlar[i];
    let toplam = 0;
    let fiyatEksik = false;

    for (const [sembol, lot] of Object.entries(lotlar)) {
      if (lot <= 0 || !verisiOlanlar.has(sembol)) continue;
      const fiyat = sonSatir ? (sonFiyatlar[sembol] ?? fiyatlar[sembol]) : fiyatlar[sembol];
      if (fiyat === undefined) {
        fiyatEksik = true;
        break;
      }
      toplam += fiyat * lot;
    }

    if (!fiyatEksik) {
      const deger = kurusaYuvarla(toplam);
      seri.push({ time, open: deger, high: deger, low: deger, close: deger });
    }
  }

  seri.reverse();
  const ilkDolu = seri.findIndex(nokta => nokta.close > 0);
  return ilkDolu === -1 ? [] : seri.slice(ilkDolu);
};

//Grafik için gereken hisseler. Satılmış hisseler de satılana kadarki değer için gerekir.
export const grafikSembolleri = (portfoy, islemler) =>
  [...new Set([...portfoy, ...islemler].map(kayit => kayit.sembol))].sort().join(',');

//Geçmiş verisi gelmeyen hisselerin sembollerini döndürür.
export const veriOlmayanHisseler = (portfoy, satirlar) => {
  if (satirlar.length === 0) return [];
  //Yeni halka arz ilk satırlarda olmayabilir, bu yüzden tüm satırlara bakılır.
  return portfoy.map(item => item.sembol).filter(sembol => !satirlar.some(satir => satir.fiyatlar[sembol] !== undefined));
};

//Portföyün toplam değerini ve kâr/zararını hesaplar.
export const portfoyOzeti = (portfoy, sonFiyatlar) => {
  const toplamPortfoyDegeri = portfoy.reduce((toplam, item) => toplam + (sonFiyatBul(item, sonFiyatlar) * item.lot), 0);
  const toplamMaliyet = portfoy.reduce((toplam, item) => toplam + (item.maliyet * item.lot), 0);
  const toplamKarZarar = toplamPortfoyDegeri - toplamMaliyet;
  const toplamKarZararYuzde = toplamMaliyet > 0 ? (toplamKarZarar / toplamMaliyet) * 100 : 0;
  return { toplamPortfoyDegeri, toplamMaliyet, toplamKarZarar, toplamKarZararYuzde };
};
