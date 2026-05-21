# Ben Kimim

Aynı odadaki 3-10 arkadaşın kendi telefonlarından oynadığı "Ben Kimim" (alna koy)
oyunu. Herkes sırayla bir sonrakine isim yazar; geri sayım sonrası her telefon o
kişiye yazılan ismi gösterir. Bilen telefonu alnından alır. "Tekrar Oyna" ile yeni tur.

## Nasıl oynanır

1. Biri **Oda Kur** der, çıkan 5 haneli kodu arkadaşlarına söyler.
2. Herkes takma adı + kodla **Odaya Katıl**.
3. Host lobide sırayı (zinciri) ayarlayıp **Başlat**.
4. Herkes sıradaki kişiye bir isim yazar.
5. Hepsi yazınca geri sayım başlar — telefonunu alnına koy.
6. Telefonun, sana yazılan ismi gösterir; ipuçlarıyla kendini tahmin et.
7. Tur bitince host **Tekrar Oyna** ile yeni tur başlatır.

## Lokal çalıştırma

```bash
npm install
npm start
# http://localhost:3000
```

Her oyuncu ayrı telefondan/cihazdan girer. Aynı bilgisayarda test için her oyuncuyu
ayrı bir gizli (incognito) pencerede aç.

## Test

```bash
npm test
```

Birim testleri zincir/oda mantığını, entegrasyon testleri ise gerçek socket akışını
(oda kurma/katılma, hedefler, sıra değiştirme, geri sayım→kelime, host devri, yeniden
bağlanma) doğrular.

## Render'a deploy

1. Bu projeyi bir GitHub reposuna push'la.
2. [render.com](https://render.com) → **New** → **Web Service** → GitHub reposunu bağla.
3. Ayarlar:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (yeterli)
4. Deploy bitince verilen `https://...onrender.com` adresini arkadaşlarınla paylaş.

Notlar:
- Sunucu `PORT` ortam değişkenini otomatik kullanır (Render bunu sağlar).
- Ücretsiz katman boştayken uyur; ilk açılış ~30 sn sürebilir.
- Oda durumu bellektedir; sunucu yeniden başlarsa açık odalar kaybolur.
