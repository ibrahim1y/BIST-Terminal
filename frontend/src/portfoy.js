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

//Geçmişteki gerçekleşen kâr/zararları toplamı burada belirtilir; bilgisi olmayan kartlar atlanır.
export const toplamGerceklesenKarZarar = (islemGecmisi) =>
  islemGecmisi.reduce((toplam, islem) => toplam + (Number.isFinite(islem.karZarar) ? islem.karZarar : 0), 0);

//Portföyün toplam değerini ve kâr/zararını hesaplar.
export const portfoyOzeti = (portfoy, sonFiyatlar) => {
  const toplamPortfoyDegeri = portfoy.reduce((toplam, item) => toplam + (sonFiyatBul(item, sonFiyatlar) * item.lot), 0);
  const toplamMaliyet = portfoy.reduce((toplam, item) => toplam + (item.maliyet * item.lot), 0);
  const toplamKarZarar = toplamPortfoyDegeri - toplamMaliyet;
  const toplamKarZararYuzde = toplamMaliyet > 0 ? (toplamKarZarar / toplamMaliyet) * 100 : 0;
  return { toplamPortfoyDegeri, toplamMaliyet, toplamKarZarar, toplamKarZararYuzde };
};
