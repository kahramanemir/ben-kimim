# Ben Kimim — İyileştirmeler ve Yeni Özellikler (2026-06-30)

Mevcut çalışan "Ben Kimim" (alna koy) çok oyunculu oyununa hata düzeltmeleri ve
yeni özellikler eklenmesi. Mevcut mimari korunur: Express + Socket.IO sunucu,
bellekte oda durumu (`src/roomStore.js`), saf zincir mantığı (`src/rooms.js`),
istemci `public/` altında.

## Amaç

1. Oyunu kilitleyebilen durumları gidermek (özellikle yazma fazında oyuncu kopması).
2. Tarayıcı tamamen kapansa bile oyuncunun aynı odaya/slota geri dönebilmesi.
3. QR ile tek adımda odaya katılma dahil, sosyal/kullanım kolaylığı özellikleri.

## Kapsam dışı (YAGNI)

- Host için "yazmayanları atla / zorla başlat" — **eklenmeyecek** (kullanıcı isteği).
- Turlar arası birikimli puan — **eklenmeyecek**; skor sadece tur içi "Bilenler" listesi.
- Kalıcı veritabanı / oda kalıcılığı — bellekte kalmaya devam.

---

## 1. Hata düzeltmeleri

### 1.1 Reconnect dayanıklılığı (tarayıcı kapansa bile geri dönüş)
- **Sorun:** Oda kodu `sessionStorage`'da tutuluyor; tarayıcı tamamen kapanınca
  siliniyor, oyuncu geri açtığında ana sayfaya düşüyor. `playerId` ise
  `localStorage`'da kalıcı ve sunucu yazma fazında kopan oyuncunun slotunu
  (yazdığı ismi dahil) koruyor.
- **Çözüm:** Aktif oda kodunu `localStorage`'a (`benkimim_code`) taşı. Bağlantı
  (`connect`) kurulunca otomatik `join_room` denemesi yapılır:
  - Başarılı → oyuncu eski slotuna ve faza özel ekranına döner (`sendPhaseState`).
  - Başarısız (oda yok / atılmış / oyun bitmiş) → kod temizlenir, ana sayfaya düşer.
- Bilinçli "Odadan Ayrıl"da kod temizlenir (mevcut davranış korunur).

### 1.2 Yazma + geri sayım ekranlarına "Odadan Ayrıl" butonu
- `index.html`: `#screen-writing` ve `#screen-countdown` ekranlarına `.ghost`
  sınıflı "Odadan Ayrıl" butonu eklenir; mevcut `leaveRoom()` akışını çağırır
  (onaylı). Böylece takılma durumunda her ekrandan çıkış mümkün.

### 1.3 `sendPhaseState`'e `countdown` durumu
- `server.js`: Geri sayım sırasında yeniden bağlanan oyuncuya `countdown_started`
  ({ seconds: kalan ya da tam süre }) gönderilir; istemci geri sayım ekranına döner.
  Kalan süreyi hassas hesaplamak yerine tam `COUNTDOWN_SECONDS` ile yeniden
  göstermek kabul edilebilir (basitlik).

### 1.4 Yazma fazında oyuncu çıkışı/atılması sonrası kilit önleme
- Yazma fazında bir oyuncu **bilinçli ayrılırsa** (`leave_room`) ya da **host
  tarafından atılırsa** (bkz. 2.3) listeden tamamen çıkarılır; zincir saf
  mantıkla otomatik yeniden türetilir.
- Çıkarma sonrası: kalan herkes isim yazdıysa (`allNamesSubmitted`) geri sayım
  otomatik başlatılır.
- Çıkarma sonrası oyuncu sayısı 2'nin altına düşerse oda lobiye döndürülür
  (yazılan isimler sıfırlanır), böylece oynanamaz duruma takılmaz.
- **Kopma (disconnect) yazma fazında oyuncuyu SİLMEZ** — slot korunur ki oyuncu
  geri dönebilsin (1.1). Geri dönmeyen oyuncu için kurtarma yolu host kick'tir.

---

## 2. Yeni özellikler

### 2.1 QR ile katılma
- **Lobi:** Oda kodunun altında istemci tarafında üretilen bir QR kod gösterilir.
  QR içeriği: `<origin>/?room=<KOD>` (örn. `https://ben-kimim.onrender.com/?room=AB3K9`).
- **QR üretimi:** Hafif bir istemci kütüphanesi (`qrcode`) ile canvas'a çizilir.
  Kütüphane `public/` altına statik dosya olarak konur (CDN bağımlılığı yok) ya da
  `node_modules`'tan kopyalanır; harici servis kullanılmaz.
- **Giriş akışı:** Sayfa `?room=KOD` ile açıldığında ana sayfa gösterilir, oda
  kodu alanı otomatik doldurulur ve takma ad alanına odak verilir. Kullanıcı
  sadece takma adını girip "Odaya Katıl"a basar. (Kod alanı görünür kalır ki
  kullanıcı doğru odaya girdiğini görsün.)

### 2.2 Oda kodunu kopyala / paylaş
- Lobide oda kodunun yanında "📋 Kopyala" butonu (`navigator.clipboard`).
- `navigator.share` destekleniyorsa "Paylaş" butonu, `/?room=KOD` linkini paylaşır.
  Desteklenmiyorsa buton gizlenir veya kopyalamaya düşer.

### 2.3 Host kick (oyuncu atma)
- **Lobi ve oyun ekranı:** Host, kendisi dışındaki her oyuncunun yanında "✕"
  butonu görür. Basınca `kick_player { playerId }` gönderilir.
- **Sunucu (`server.js` + `src/rooms.js`):** Sadece host çağırabilir, kendini
  atamaz. Atılan oyuncu listeden çıkarılır; ona `kicked` olayı gönderilir
  (istemci ana sayfaya döner, kayıtlı kod temizlenir). Zincir/host devri/oda
  temizliği `leave_room` ile aynı kurallarla işlenir. Yazma fazında atma için
  1.4'teki countdown-tetikleme kontrolü uygulanır.

### 2.4 Kategori önerisi (yazma ekranı)
- Yazma formunun üstünde kategori seçici (`<select>`): Ünlüler, Çizgi film,
  Futbolcu, Tarihi, Hayvan. Yanında "💡 Öner" butonu.
- İsim havuzları **istemcide** sabit dizilerde tutulur (sunucu değişmez).
  "Öner" basınca seçili kategoriden rastgele bir isim `#name-input`'a yazılır;
  kullanıcı düzenleyip ya da olduğu gibi gönderebilir.

### 2.5 Geri sayımda titreşim + ses
- `countdown_started` alınınca: `navigator.vibrate` (destekliyorsa) ve WebAudio
  ile kısa bip. Her ikisi de yoksa sessizce geçilir; hata fırlatmaz.

### 2.6 Tur sonu "Bildim 🎉" + Bilenler listesi
- Oyun ekranında "Bildim 🎉" butonu. Basınca `guessed` olayı gönderilir.
- **Sunucu:** Oyuncuda `guessedAt` (sıra/zaman) işaretlenir; odaya `guesses`
  yayını yapılır (bilenler sıralı + henüz bilmeyenler). `play_again`,
  `return_to_lobby` ve yeni yazma fazında `guessedAt` sıfırlanır.
- **İstemci:** Oyun ekranında "Bilenler" listesi; sıra ile bilenler, en altta
  "henüz tahmin ediyor" olanlar. Birikimli puan yoktur.

---

## Veri modeli değişiklikleri

`room.players[i]` nesnesine eklenenler:
- `guessedAt: number | null` — tur içi "bildim" sırası/zamanı (yeni turda null).

Diğer alanlar (`id`, `name`, `writtenName`, `connected`, `socketId`) korunur.
`room.state` değerleri değişmez: `lobby | writing | countdown | playing`.

## Yeni Socket olayları

İstemci → sunucu: `kick_player { playerId }`, `guessed`.
Sunucu → istemci: `kicked`, `guesses { players: [{id,name,guessedAt}] }`.
Mevcut olaylar korunur; `sendPhaseState` countdown'ı da kapsar.

## Bileşen sınırları

- `src/rooms.js`: saf, durumsuz yardımcılar — kick/removal sonrası dizi türetme,
  guessed sıfırlama, "kalan herkes yazdı mı" kontrolü. Socket/IO bilmez.
- `src/roomStore.js`: oda yaşam döngüsü; değişmez.
- `server.js`: olay yönlendirme + yayınlar; saf mantığı `rooms.js`'ten kullanır.
- `public/app.js`: ekran yönetimi, kalıcı kimlik/kod, QR, kategori, ses, skor UI.

## Test stratejisi

Mevcut 16 test korunur. Eklenecek birim/entegrasyon testleri:
- Yazma fazında `leave_room` sonrası kalan herkes yazmışsa countdown başlar.
- Host `kick_player`: atılan listeden düşer, gerekiyorsa host devri olur,
  atılana `kicked` gider.
- Yazma fazında kick sonrası countdown tetiklenir / 2 altına düşünce lobiye döner.
- `guessed`: `guesses` yayını sıralı gelir; yeni turda sıfırlanır.
- Countdown sırasında reconnect → `countdown_started` alınır.

Tarayıcı API'lerine bağlı kısımlar (QR çizimi, kopyala/paylaş, titreşim, ses)
manuel doğrulanır; mantık kısımları (`?room=` ayrıştırma, kategori seçimi)
mümkün olduğunca saf fonksiyonlara ayrılır.

## Riskler / kararlar

- `qrcode` kütüphanesi istemciye statik eklenir; CDN'e bağımlılık yok.
- Geri sayım reconnect'inde kalan süre yeniden tam gösterilir (kabul edilen basitlik).
- Yazma fazında disconnect oyuncuyu silmez (geri dönüş için); kalıcı kilit host
  kick ile çözülür.
