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

// Portföyde olup piyasa listesinde olmayan, yani endeksten çıkmış hisseler.
// Liste henüz gelmediyse hiçbiri sayılmaz, böylece bütün portföy boşuna ayrıca sorulmaz.
export const endeksDisiSemboller = (portfoy, hisseler) => {
  if (hisseler.length === 0) return [];
  const listede = new Set(hisseler.map(h => h.sembol));
  return [...new Set(portfoy.map(p => p.sembol))].filter(s => !listede.has(s)).sort();
};

//Tek hissenin kâr/zararını hesaplar.
export const karZararHesapla = (item, fiyat) => ({
  karZarar: (fiyat - item.maliyet) * item.lot,
  karZararYuzde: ((fiyat - item.maliyet) / item.maliyet) * 100
});

//Bir satışın gerçekleşen kâr/zararını ortalama maliyete göre hesaplayacak.
export const gerceklesenKarZarar = (item, satisFiyati, miktar) => (satisFiyati - item.maliyet) * miktar;

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

const ISTANBUL_FARKI_MS = 3 * 60 * 60 * 1000;

//İşlemleri eskiden yeniye sıralar ve bir işlemi lotlara yansıtır. Lot sıfırın altına düşmez.
const islemSirali = (islemler) => islemler.filter(islem => Number.isFinite(islem.id)).sort((a, b) => a.id - b.id);
const islemiLotlaraYansit = (lotlar, { tip, sembol, lot }) => {
  lotlar[sembol] = Math.max(0, (lotlar[sembol] ?? 0) + (tip === 'SAT' ? -lot : lot));
};

//Portföydeki lotu işlem kayıtlarının toplamından fazla olan hisseleri döner.
export const kaydiOlmayanHisseler = (portfoy, islemler) => {
  const kayitliLotlar = {};
  islemSirali(islemler).forEach(islem => islemiLotlaraYansit(kayitliLotlar, islem));
  return portfoy.filter(item => item.lot > (kayitliLotlar[item.sembol] ?? 0)).map(item => item.sembol);
};

export const grafikSembolleri = (portfoy, islemler) =>
  [...new Set([...portfoy, ...islemler].map(kayit => kayit.sembol))].sort().join(',');

//Portföyün toplam değerini ve kâr/zararını hesaplar.
export const portfoyOzeti = (portfoy, sonFiyatlar) => {
  const toplamPortfoyDegeri = portfoy.reduce((toplam, item) => toplam + (sonFiyatBul(item, sonFiyatlar) * item.lot), 0);
  const toplamMaliyet = portfoy.reduce((toplam, item) => toplam + (item.maliyet * item.lot), 0);
  const toplamKarZarar = toplamPortfoyDegeri - toplamMaliyet;
  const toplamKarZararYuzde = toplamMaliyet > 0 ? (toplamKarZarar / toplamMaliyet) * 100 : 0;
  return { toplamPortfoyDegeri, toplamMaliyet, toplamKarZarar, toplamKarZararYuzde };
};

//İşlem geçmişini backend'in beklediği biçime çevirir. Sıra ve saat korunur, aynı gün yapılan işlemler karışmaz.
export const analizIslemleri = (islemler) => islemSirali(islemler)
  .filter(islem => islem.lot > 0 && islem.fiyat > 0)
  .map(islem => ({
    date: new Date(islem.id + ISTANBUL_FARKI_MS).toISOString().slice(0, 19),
    ticker: `${islem.sembol}.IS`,
    type: islem.tip === 'SAT' ? 'SELL' : 'BUY',
    quantity: islem.lot,
    price: islem.fiyat,
  }));

//Backend sonucunun son gününü ve özetini canlı fiyatlarla günceller. Maliyet ve gerçekleşen kâr fiyata bağlı değildir.
export const analiziCanlandir = (analiz, sonFiyatlar) => {
  if (!analiz || analiz.series.length === 0) return analiz;

  const sonGun = analiz.series[analiz.series.length - 1];
  const portfolio_value = kurusaYuvarla(analiz.positions.reduce(
    (toplam, p) => toplam + p.lots * (sonFiyatlar[p.ticker.replace(/\.IS$/, '')] ?? p.last_price),
    0
  ));
  const acikKar = portfolio_value - sonGun.total_invested;
  const guncelGun = {
    ...sonGun,
    portfolio_value,
    unrealized_pnl: kurusaYuvarla(acikKar),
    unrealized_return_pct: sonGun.total_invested > 0 ? kurusaYuvarla((acikKar / sonGun.total_invested) * 100) : 0,
    // Bugünkü lotların hepsi elde kalan lot olduğu için canlı değer bu hesapta da geçerlidir.
    held_pnl: kurusaYuvarla(portfolio_value - sonGun.held_invested),
    held_return_pct: sonGun.held_invested > 0 ? kurusaYuvarla(((portfolio_value - sonGun.held_invested) / sonGun.held_invested) * 100) : 0,
  };
  return { ...analiz, summary: guncelGun, series: [...analiz.series.slice(0, -1), guncelGun] };
};

//Tüm geçmiş hesaplandıktan sonra ekranda gösterilecek dönem kesilir. Maliyet hesabı dönemden etkilenmez.
const DONEM_GUNLERI = { '1h': 7, '1a': 30, '3a': 90, '1y': 365, '5y': 1825 };
export const seriyiDonemeGoreKes = (seri, donem) => {
  const gun = DONEM_GUNLERI[donem];
  if (!gun || seri.length === 0) return seri;
  const sinir = new Date(Date.parse(seri[seri.length - 1].date) - gun * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return seri.filter(nokta => nokta.date >= sinir);
};

// Borsanın kapalı olduğu günler önceki günün aynısıdır, grafikte düz bölüm yaratmasın diye çıkarılır.
// Değer, maliyet veya gerçekleşen kâr değiştiyse gün kalır; hafta sonu yapılan işlem böylece kaybolmaz. Son gün her zaman kalır.
export const kapaliGunleriCikar = (seri) => seri.filter((nokta, i) => {
  if (i === 0 || i === seri.length - 1 || nokta.date.includes('T')) return true;
  const onceki = seri[i - 1];
  return nokta.portfolio_value !== onceki.portfolio_value
    || nokta.total_invested !== onceki.total_invested
    || nokta.realized_pnl !== onceki.realized_pnl;
});


// Siyah arka planda belirgin görünen grafik renkleri.
export const GRAFIK_YESIL = '#00ff5e';
export const GRAFIK_KIRMIZI = '#ff1f1f';

// Para ve kâr/zarar gösterimi bütün sayfalarda aynı olsun diye tek yerde tutulur.
export const tl = (tutar) => `${tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
export const isaretliTl = (tutar) => `${tutar > 0 ? '+' : ''}${tl(tutar)}`;
export const isaretliYuzde = (yuzde) => `${yuzde > 0 ? '+' : ''}${yuzde.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
export const karRengi = (tutar) => (tutar >= 0 ? 'text-emerald-400' : 'text-red-400');

// "En fazla" düğmesi: alışta bakiyenin yettiği, satışta eldeki lot sayısı.
export const enFazlaLot = (islemTipi, nakitBakiye, fiyat, eldekiLot) => {
  if (islemTipi === 'SAT') return eldekiLot;
  return fiyat > 0 && nakitBakiye > 0 ? Math.floor(nakitBakiye / fiyat) : 0;
};

// Seçilen dönemin ilk kapanışına göre yüzde değişim. Veri yoksa null döner.
export const donemDegisimi = (veri, fiyat) => {
  const ilk = veri[0]?.close;
  return ilk > 0 && Number.isFinite(fiyat) ? kurusaYuvarla(((fiyat - ilk) / ilk) * 100) : null;
};

// Dönem kâr/zararı: elde kalan lotların bugünkü değeri eksi dönem başı referansı. Satılan lotlar bu hesaba girmez.
export const donemKari = (pozisyonlar, sonFiyatlar, sonKapanislar = {}) => {
  let deger = 0;
  let referans = 0;
  for (const { ticker, lots, reference } of pozisyonlar) {
    const fiyat = sonFiyatlar[ticker.replace(/\.IS$/, '')] ?? sonKapanislar[ticker];
    deger += lots * (fiyat ?? reference / lots);
    referans += reference;
  }
  const tutar = kurusaYuvarla(deger - referans);
  return { tutar, yuzde: referans > 0 ? kurusaYuvarla(((deger - referans) / referans) * 100) : 0 };
};

// Kâr/Zarar grafiğini üstteki dönem kârıyla aynı başlangıca çeker. Son nokta şeritle aynı olur.
// Fark sabittir: dönem başı referansı eksi elde kalan lotların maliyeti. Dönem başında çizgi sıfırdan başlar.
export const donemKarSerisi = (seri, pozisyonlar) => {
  if (seri.length === 0) return seri;
  const referans = pozisyonlar.reduce((toplam, p) => toplam + p.reference, 0);
  const fark = referans - seri[seri.length - 1].held_invested;
  return seri.map(nokta => {
    const donem_kari = kurusaYuvarla(nokta.held_pnl - fark);
    return { ...nokta, donem_kari, donem_getiri: referans > 0 ? kurusaYuvarla((donem_kari / referans) * 100) : 0 };
  });
};

// Günlük seri ilk alımdan başlar. 5Y grafiğinin dönemin tamamını göstermesi için öncesi hafta içi günlerde sıfırla doldurulur.
export const donemBasinaKadarDoldur = (seri, donem) => {
  const gun = DONEM_GUNLERI[donem];
  if (!gun || seri.length === 0) return seri;
  const gunMs = 24 * 60 * 60 * 1000;
  const ilk = Date.parse(seri[0].date);
  const sifirlar = [];
  for (let zaman = Date.parse(seri[seri.length - 1].date) - gun * gunMs; zaman < ilk; zaman += gunMs) {
    const haftaGunu = new Date(zaman).getUTCDay();
    if (haftaGunu === 0 || haftaGunu === 6) continue;
    sifirlar.push({
      date: new Date(zaman).toISOString().slice(0, 10),
      portfolio_value: 0, total_invested: 0, unrealized_pnl: 0, unrealized_return_pct: 0, realized_pnl: 0,
      held_invested: 0, held_pnl: 0, held_return_pct: 0,
    });
  }
  return [...sifirlar, ...seri];
};

// Bölünme ve bedelsiz sermaye artırımı.
// Yahoo bölünmeden önceki fiyatları oranla böler. Eski işlemler aynı oranla düzeltilmezse portföy sahte zarar gösterir.
const LOT_HASSASIYETI = 1e-6;
const lotYuvarla = (lot) => Math.round(lot * 1e6) / 1e6;

// Yahoo bazı oranları 18.999012 gibi verir. Tam sayıya çok yakın oranlar tam sayı kabul edilir.
export const bolunmeOrani = (oran) => (Math.abs(oran - Math.round(oran)) < 0.005 ? Math.round(oran) : oran);

// Bölünme o günün seans açılışında (İstanbul 10:00) geçerli olur. Bu andan önceki işlemler eski fiyattandır.
export const bolunmeZamani = (tarih) => {
  const [yil, ay, gun] = tarih.split('-').map(Number);
  return Date.UTC(yil, ay - 1, gun, 7);
};

// Bir hissenin işlemlerini sırayla oynatır; son lotu, ortalama maliyeti ve her satışın gerçekleşen kârını verir.
const pozisyonuOynat = (islemler) => {
  let lot = 0;
  let maliyet = 0;
  const karlar = new Map();
  islemSirali(islemler).forEach(islem => {
    if (islem.tip === 'SAT') {
      const miktar = Math.min(islem.lot, lot);
      karlar.set(islem.id, (islem.fiyat - maliyet) * miktar);
      lot = lotYuvarla(lot - miktar);
      if (lot <= LOT_HASSASIYETI) {
        lot = 0;
        maliyet = 0;
      }
    } else {
      maliyet = (lot * maliyet + islem.lot * islem.fiyat) / (lot + islem.lot);
      lot = lotYuvarla(lot + islem.lot);
    }
  });
  return { lot, maliyet, karlar };
};

// Henüz işlenmemiş bölünmeleri portföye, işlem geçmişine ve nakde uygular. Değişiklik yoksa null döner.
// Bölünmeden önceki işlemlerin lotu oranla çarpılır, fiyatı bölünür; tutarı değişmez.
// Bölünme anında elde kalan küsurat lot o günün kapanışından satılmış sayılır, tutarı nakde geçer.
// Portföydeki lot ve ortalama maliyet düzeltilmiş geçmişten yeniden hesaplanır.
export const bolunmeleriUygula = ({ portfoy, islemler, nakit, uygulananlar }, bolunmeler) => {
  let yeniPortfoy = portfoy;
  let yeniIslemler = islemler;
  let yeniNakit = nakit;
  const yeniUygulananlar = [...uygulananlar];
  const islenenler = [];
  const kullanilanlar = new Set([...islemler, ...nakit].map(kayit => kayit.id));
  const benzersizZaman = (zaman) => {
    let deger = zaman;
    while (kullanilanlar.has(deger)) deger += 1;
    kullanilanlar.add(deger);
    return new Date(deger);
  };

  Object.keys(bolunmeler ?? {}).sort().forEach(sembol => {
    const olaylar = [...(bolunmeler[sembol] ?? [])].sort((a, b) => a.tarih.localeCompare(b.tarih));
    olaylar.forEach(({ tarih, oran: hamOran, kapanis }) => {
      const anahtar = `${sembol}:${tarih}`;
      if (yeniUygulananlar.includes(anahtar) || !(hamOran > 0) || hamOran === 1) return;
      const sinir = bolunmeZamani(tarih);
      const hisseIslemleri = yeniIslemler.filter(islem => islem.sembol === sembol);
      // Bölünmeden önce işlem yoksa düzeltilecek bir şey yoktur.
      if (!hisseIslemleri.some(islem => islem.id < sinir)) {
        yeniUygulananlar.push(anahtar);
        return;
      }
      // Portföydeki lot işlem kayıtlarıyla uyuşmuyorsa geçmiş eksiktir. Yanlış düzeltme yapılmasın diye dokunulmaz.
      const mevcut = yeniPortfoy.find(p => p.sembol === sembol);
      if (Math.abs(pozisyonuOynat(hisseIslemleri).lot - (mevcut?.lot ?? 0)) > LOT_HASSASIYETI) return;

      const oran = bolunmeOrani(hamOran);
      const duzeltilmis = hisseIslemleri.map(islem => (islem.id < sinir
        ? { ...islem, lot: lotYuvarla(islem.lot * oran), fiyat: islem.fiyat / oran, bolunme: (islem.bolunme ?? 1) * oran }
        : islem));
      const eldeki = pozisyonuOynat(duzeltilmis.filter(islem => islem.id < sinir));
      const kusurat = lotYuvarla(eldeki.lot - Math.floor(eldeki.lot + LOT_HASSASIYETI));
      const ekler = [];
      if (kusurat > LOT_HASSASIYETI) {
        const fiyat = kapanis > 0 ? kapanis : eldeki.maliyet;
        const zaman = benzersizZaman(sinir);
        ekler.push({ ...islemKaydi('SAT', sembol, kusurat, fiyat, zaman), kusurat: true });
        yeniNakit = [nakitHareketi('KÜSURAT', kusurat * fiyat, `${sembol} bölünme küsuratı`, zaman), ...yeniNakit];
      }

      const tumu = [...duzeltilmis, ...ekler];
      const { lot, maliyet, karlar } = pozisyonuOynat(tumu);
      const sonHali = tumu.map(islem => (karlar.has(islem.id) ? { ...islem, karZarar: karlar.get(islem.id) } : islem));
      yeniIslemler = [...yeniIslemler.filter(islem => islem.sembol !== sembol), ...sonHali];
      const yedekFiyat = kapanis > 0 ? kapanis : maliyet;
      if (lot <= LOT_HASSASIYETI) {
        yeniPortfoy = yeniPortfoy.filter(p => p.sembol !== sembol);
      } else if (mevcut) {
        yeniPortfoy = yeniPortfoy.map(p => (p.sembol === sembol ? { ...p, lot, maliyet, fiyat: yedekFiyat } : p));
      } else {
        yeniPortfoy = [...yeniPortfoy, { sembol, lot, maliyet, fiyat: yedekFiyat }];
      }
      yeniUygulananlar.push(anahtar);
      islenenler.push({ sembol, tarih, oran, kusurat });
    });
  });

  if (yeniUygulananlar.length === uygulananlar.length) return null;
  return {
    portfoy: yeniPortfoy,
    islemler: [...yeniIslemler].sort((a, b) => b.id - a.id),
    nakit: [...yeniNakit].sort((a, b) => b.id - a.id),
    uygulananlar: yeniUygulananlar,
    islenenler,
  };
};

// Tanıtım için örnek portföy. Siteyi ilk kez açan biri boş ekran yerine dolu grafikler görsün diye
// son 3 ayın gerçek kapanışlarıyla birkaç alım ve bir satış yapılmış gibi kayıt üretilir.
export const DEMO_YATIRIM = 100000;
// gun: son işlem gününden kaç işlem günü önce yapıldığı.
export const DEMO_PLANI = [
  { gun: 60, tip: 'AL', sembol: 'THYAO', lot: 50 },
  { gun: 60, tip: 'AL', sembol: 'GARAN', lot: 100 },
  { gun: 45, tip: 'AL', sembol: 'ASELS', lot: 40 },
  { gun: 30, tip: 'AL', sembol: 'BIMAS', lot: 30 },
  { gun: 30, tip: 'AL', sembol: 'TUPRS', lot: 30 },
  { gun: 15, tip: 'SAT', sembol: 'THYAO', lot: 20 },
  { gun: 7, tip: 'AL', sembol: 'GARAN', lot: 50 },
];
export const demoSembolleri = (plan = DEMO_PLANI) => [...new Set(plan.map(adim => adim.sembol))];

// grafikler: { SEMBOL: [{ time: 'YYYY-MM-DD', close }] } (hisse grafiğinin günlük verisi).
// İşlemler İstanbul saatiyle 11:00'de, plan sırasıyla birer dakika arayla yapılmış sayılır. Bakiye yetmeyen alım veya verisi olmayan hisse atlanır.
export const demoPortfoyuOlustur = (grafikler, plan = DEMO_PLANI, yatirim = DEMO_YATIRIM) => {
  const adimlar = plan.map((adim, sira) => {
    const mumlar = grafikler[adim.sembol] ?? [];
    if (mumlar.length === 0) return null;
    const mum = mumlar[Math.max(0, mumlar.length - 1 - adim.gun)];
    const [yil, ay, gun] = String(mum.time).slice(0, 10).split('-').map(Number);
    return { ...adim, fiyat: Number(mum.close), zaman: Date.UTC(yil, ay - 1, gun, 8, sira) };
  }).filter(adim => adim && adim.fiyat > 0).sort((a, b) => a.zaman - b.zaman);
  if (adimlar.length === 0) return null;

  let portfoy = [];
  const islemler = [];
  let nakit = [nakitHareketi('YATIRMA', yatirim, 'Demo', new Date(adimlar[0].zaman - 60000))];
  adimlar.forEach(({ tip, sembol, lot, fiyat, zaman }) => {
    const an = new Date(zaman);
    const kayit = islemKaydi(tip, sembol, lot, fiyat, an);
    if (tip === 'AL') {
      if (!yeterliBakiyeVarMi(bakiyeHesapla(nakit), kayit.tutar)) return;
      portfoy = alimUygula(portfoy, { sembol }, lot, fiyat);
      islemler.push(kayit);
      nakit = [nakitHareketi('ALIM', -kayit.tutar, sembol, an), ...nakit];
    } else {
      const mevcut = portfoy.find(p => p.sembol === sembol);
      const yeni = satimUygula(portfoy, sembol, lot);
      if (yeni === null) return;
      portfoy = yeni;
      islemler.push({ ...kayit, karZarar: gerceklesenKarZarar(mevcut, fiyat, lot) });
      nakit = [nakitHareketi('SATIM', kayit.tutar, sembol, an), ...nakit];
    }
  });
  return {
    portfoy,
    islemler: islemler.sort((a, b) => b.id - a.id),
    nakit: nakit.sort((a, b) => b.id - a.id),
  };
};
