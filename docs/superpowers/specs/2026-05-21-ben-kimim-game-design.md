# Ben Kimim — Çok Oyunculu Mobil Oyun (Tasarım)

**Tarih:** 2026-05-21
**Durum:** Onaylandı (uygulama planı bekleniyor)

## Amaç

Arkadaş grubunun (3-10 kişi) aynı odada, herkesin kendi telefonundan oynadığı
"Ben Kimim" / alna koy (Heads Up) tarzı bir oyun. Herkes sırayla bir sonraki
kişiye bir isim yazar; tüm isimler girilince oyun başlar, geri sayım sonrası her
telefon o kişiye yazılan ismi tam ekran ve dışa dönük gösterir. Kişiler birbirine
sözlü ipucu verip kendi ismini tahmin eder; bilen telefonu alnından alır. Uygulama
içinde tahmin/skor mekaniği yoktur. "Tekrar Oyna" ile yeni tur oynanır.

GitHub reposu olarak Render'a deploy edilecek.

## Kapsam (MVP)

Dahil:
- Oda kurma (5 haneli kod) ve koda göre katılma (takma ad ile)
- Lobide canlı oyuncu listesi
- Host'un katılım/zincir sırasını düzenlemesi (yukarı/aşağı taşıma)
- İsim yazma fazı: her oyuncu sıradaki kişiye bir isim yazar, canlı ilerleme
- Eşzamanlı geri sayım ("Telefonu alnına koy!")
- Oyun fazı: tam ekran, büyük, yüksek kontrastlı kelime; ekran uyumaz (wake lock)
- Tekrar Oyna (yeni tur, aynı oyuncular) ve Lobiye Dön
- Kopma/yenileme sonrası aynı yere geri dönme (localStorage'da kalıcı id)

Dahil değil (YAGNI):
- Skor, zamanlayıcı, tahmin onayı, telefon eğme
- Hesap/giriş, veritabanı, kalıcı oda geçmişi
- Kategori/kelime havuzu (isimleri oyuncular yazar)
- Görüntülü/sesli iletişim (oyuncular aynı odada)

## Mimari

**Stack:** Node.js + Express + Socket.IO. Oda durumu sunucu belleğinde tutulur
(veritabanı yok — odalar geçici). Frontend sade HTML/CSS/JS, aynı Express
sunucusundan statik servis edilir. Tek bir Render Web Service.

Gerekçe: Tüm telefonların anlık senkronu (eşzamanlı geri sayım, "tekrar oyna"
ile herkesi aynı duruma alma) gerçek zamanlı iletişim gerektirir. Socket.IO bunu
sağlar ve Render WebSocket'i destekler. Bu boyutta React/build adımı veya harici
Firebase bağımlılığı gereksiz karmaşıklık olur.

### Dosya yapısı
```
server.js            # Express + Socket.IO bağlama, statik servis, PORT
src/rooms.js         # Saf oda/zincir mantığı (test edilebilir, IO'dan bağımsız)
src/roomStore.js     # Bellekteki oda koleksiyonu (oluştur/bul/sil)
public/index.html    # Tek sayfa, ekranlar JS ile değişir
public/app.js        # Socket istemcisi + ekran yönetimi
public/style.css     # Mobil öncelikli stil
test/rooms.test.js   # node:test ile birim testleri
package.json
README.md            # Render deploy adımları
.gitignore
```

## Veri Modeli (bellekte)

```js
room = {
  code,            // "5 haneli", benzersiz
  hostId,          // host oyuncunun id'si
  state,           // 'lobby' | 'writing' | 'countdown' | 'playing'
  players: [Player], // sıra = zincir sırası (host düzenleyebilir)
  createdAt,
}

player = {
  id,              // kalıcı, istemcide localStorage'da saklanır
  name,            // takma ad
  connected,       // bool
  writtenName,     // bu oyuncunun SIRADAKİ kişiye yazdığı isim (null=henüz yok)
}
```

Zincir: `players` dizisi bir halka. `players[i]`, `players[i+1]` için yazar; son
oyuncu `players[0]` için yazar. Bir oyuncunun **oyunda gördüğü** kelime =
kendisinden bir ÖNCEKİ oyuncunun `writtenName` değeri.

Saf fonksiyonlar (`src/rooms.js`, test edilir):
- `generateCode()` → benzersiz olmayan aday; store benzersizliği garanti eder
- `targetOf(players, playerId)` → o oyuncunun isim yazacağı kişi
- `wordFor(players, playerId)` → o oyuncunun oyunda göreceği kelime
- `allNamesSubmitted(players)` → bool
- `reorderPlayer(players, playerId, direction)` → yeni sıralı dizi
- `resetWrittenNames(players)` → tekrar oyna için temizler

## Gerçek Zamanlı Olaylar

İstemci → Sunucu:
- `create_room { nickname }` → `{ code, playerId, room }`
- `join_room { code, nickname, playerId? }` → `{ playerId, room }` | `error`
- `reorder_player { playerId, direction }` (yalnız host) → `room_update`
- `start_writing {}` (yalnız host, ≥3 oyuncu) → zincir kurulur, `writing_started`
- `submit_name { name }` → `writing_progress`; hepsi bitince `countdown_started`
- `play_again {}` (yalnız host) → isimler temizlenir, `writing_started`
- `return_to_lobby {}` (yalnız host) → `room_update` (lobby)

Sunucu → İstemci:
- `room_update { state, players, hostId }` — lobi/genel durum değişimi
- `writing_started { yourTarget }` — kime isim yazılacağı (takma ad)
- `writing_progress { submitted, total }`
- `countdown_started { seconds }` — örn. 5; tüm istemciler aynı anda sayar
- `game_started { yourWord }` — bu telefonda gösterilecek kelime
- `error { message }`

Geçişler: Tüm isimler girilince sunucu `countdown_started` yayınlar; `seconds`
saniye sonra (sunucu zamanlayıcısı) `game_started` ile her oyuncuya kendi kelimesi
gönderilir ve oda `playing` olur.

## Ekranlar (mobil öncelikli, Türkçe)

1. **Ana sayfa:** "Oda Kur" / "Odaya Katıl" (kod + takma ad girişi)
2. **Lobi:** Büyük oda kodu, canlı oyuncu listesi. Host'ta her oyuncu için
   yukarı/aşağı ok (sıra düzenleme) ve "Başlat" (≥3 olunca aktif).
3. **İsim Yazma:** "[Hedef] için bir isim yaz" + gönder; sonra "Bekleniyor… 4/6".
4. **Geri Sayım:** Büyük rakam + "Telefonu alnına koy!".
5. **Oyun:** Tam ekran, büyük, yüksek kontrastlı kelime; yatay okunaklı; wake lock
   açık. Host'ta "Tekrar Oyna" ve "Lobiye Dön" butonları.

## Hata ve Kenar Durumları

- **Geçersiz/dolmuş oda kodu:** `error` ile kullanıcıya mesaj.
- **Aynı takma ad:** İzin verilir (id ile ayırt edilir); istenirse sonradan engellenebilir.
- **Kopma/yenileme:** İstemci localStorage'daki `playerId` ile `join_room` yapar;
  sunucu mevcut slotu `connected=true` yapar, durumu geri yollar.
- **Oyuncu lobide ayrılırsa:** Listeden çıkarılır, zincir yeniden hesaplanır.
- **Oyuncu yazma/oyun sırasında ayrılırsa:** `connected=false` işaretlenir; tur
  devam eder (yazdığı isim zaten saklı). Geri gelirse slotuna döner.
- **Host ayrılırsa:** Host, en erken katılmış bağlı oyuncuya devredilir.
- **<3 oyuncu:** "Başlat" pasif.
- **Boş odalar:** Tüm oyuncular kopunca oda bir süre sonra (örn. 30 dk) temizlenir.

## Test

- **Birim (TDD, `node:test`):** `src/rooms.js` saf fonksiyonları — zincir hedefi,
  oyunda görülen kelime, tüm isimler girildi mi, sıra düzenleme, isim sıfırlama,
  halka kenar durumları (3 ve 10 oyuncu).
- **Manuel:** Lokalde sunucu açılır, birden fazla sekme/telefonla 3-6 oyuncu ile
  tam akış (kur → katıl → sırala → yaz → geri sayım → oyun → tekrar oyna) denenir.
- Deploy öncesi gerçek telefonlarla bir tur oynanır.

## Render Deploy

- `package.json`: `"start": "node server.js"`, `engines.node` belirtilir.
- Sunucu `process.env.PORT` dinler (yoksa 3000).
- Render: New → Web Service → GitHub repo bağla → Build `npm install`,
  Start `npm start`. Socket.IO/WebSocket Render'da çalışır.
- Not: Ücretsiz katman boşta uyur; ilk istek ~30 sn gecikebilir.
- Adımlar README.md'ye yazılır.
