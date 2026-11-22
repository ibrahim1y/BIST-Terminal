# BIST Terminal

Borsa İstanbul hisselerini izlemek ve sanal alım-satım yapmak için bir web uygulaması. Gerçek emir göndermez, gerçek para kullanmaz.

## Özellikler

- Hisse listesi, arama, favoriler, yükselen ve düşen sekmeleri, mini grafikler
- Mum ve çizgi hisse grafikleri, 1G'den 5Y'ye dönem seçimi, tam ekran
- Hacim ve teknik göstergeler: SMA, EMA, Bollinger, RSI, MACD
- Hisse özeti, piyasa genişliği, en çok yükselen ve düşen hisseler
- Endeks, döviz ve altın şeridi
- Sanal alım-satım ve ağırlıklı ortalama maliyet
- Portföy özeti, açık ve gerçekleşen kâr/zarar, dağılım grafiği
- Portföy grafiği: toplam kâr/zarar ve portföy değeri görünümleri
- Nakit bakiye ve simülasyon amaçlı para yatırma
- İşlem geçmişi ve nakit hareketleri
- Veri alınamadığında son alınan fiyatlarla çalışma

## Teknolojiler

- **Frontend:** React, Vite, Tailwind CSS, Lightweight Charts, Recharts
- **Backend:** FastAPI, yfinance, pandas

## Kurulum

Python 3.12 ve Node.js 24 ile denenmiştir.

```bash
git clone https://github.com/ibrahim1y/BIST-Terminal.git
cd BIST-Terminal
```

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

macOS ve Linux'ta sanal ortamı `source venv/bin/activate` ile etkinleştirin.

### Frontend

```bash
cd frontend
npm install
```

## Çalıştırma

İki ayrı terminal gerekir.

**Backend** (`backend` klasöründe, sanal ortam etkinken):

```bash
python -m uvicorn main:app --reload
```

**Frontend** (`frontend` klasöründe):

```bash
npm run dev
```

Uygulamayı [http://localhost:5173](http://localhost:5173) adresinden açın. Backend yalnızca bu adresten gelen isteklere izin verir, bu yüzden `127.0.0.1:5173` adresi çalışmaz.

## Testler

`frontend` klasöründe:

```bash
npm test
```

Testler al/sat, kâr/zarar ve bakiye hesaplarını kapsar.

Portföy analizi testleri için `backend` klasöründe:

```bash
python -m unittest
```

## API

| Uç | Açıklama |
|---|---|
| `GET /api/hisseler` | Hisse listesi: fiyat, günlük değişim, gün özeti, hacim, mini grafik verisi, şirket adı ve sektör (30 saniye önbellekli) |
| `GET /api/gostergeler` | BIST 100, BIST 30, BIST Banka, Dolar/TL, Euro/TL ve ons altın (30 saniye önbellekli) |
| `GET /api/grafik/{sembol}` | Hissenin mum verisi. `donem` parametresi: `1g`, `1h`, `1a`, `3a`, `1y`, `5y` (varsayılan `3a`) |
| `POST /api/portfoy-analiz` | İşlem geçmişinden ağırlıklı ortalama maliyet, açık ve gerçekleşen kâr ile günlük zaman serisi |
| `POST /api/portfoy-analiz/gun-ici` | Aynı analiz, gün içi seriyle. `donem`: `1g` (2 dakikalık), `1h`, `1a`, `3a`, `1y` (saatlik) |
| `POST /api/portfoy-donem-kari` | Elde kalan lotların 1G-5Y dönem başı referansları, satılan lotlar hariç |

## Notlar

- Fiyatlar Yahoo Finance'ten alınır ve gecikmeli olabilir.
- Şirket adları ve sektörler `backend/sirketler.json` dosyasındadır. Listeye yeni hisse eklenince adı İş Yatırım'dan, sektörü KAP'tan açılışta ve günde bir otomatik tamamlanır. BIST 100 endeksinin üyeleri de KAP'tan günde bir alınıp `backend/bist100.json` dosyasına yazılır; endeks değişince liste kendiliğinden güncellenir.
- Portföy, işlem geçmişi, nakit hareketleri ve son fiyatlar yalnızca tarayıcının `localStorage` alanında tutulur. Tarayıcı verileri silinirse bunlar da silinir.
- Para yatırma simülasyondur, gerçek para kullanılmaz.
- Bu proje yatırım tavsiyesi vermez.

## Sorun Giderme

**Windows'ta `DLL load failed ... Uygulama Denetimi ilkesi bu dosyayı engelledi`:** Windows Akıllı Uygulama Denetimi, pandas gibi paketlerin dosyalarını engelleyebilir. Bu durumda backend başlamaz.
