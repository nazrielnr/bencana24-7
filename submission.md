# Dokumentasi Proyek: Siaga (Bencana24/7)

## Informasi Peserta
| No | Nama | Email Dicoding |
|----|------|----------------|
| 1  | BiuBiu | anonymousblack987@gmail.com |
| 2  | - | - |
| 3  | - | - |

## Problem Statement
Indonesia merupakan wilayah "Ring of Fire" dengan frekuensi bencana alam (gempa bumi dan cuaca ekstrem) yang sangat tinggi. Permasalahan utama yang dihadapi masyarakat adalah:
1. **Raw Data Overload**: Informasi dari otoritas seringkali teknis (koordinat, magnitude, MB) yang sulit dipahami dampaknya secara instan oleh warga awam.
2. **Kurangnya Kontekstualisasi**: Masyarakat sering bertanya "Apakah lokasi saya saat ini aman?" namun harus membandingkan sendiri jarak mereka dengan pusat bencana.
3. **Penyebaran Informasi Terfragmentasi**: Informasi cuaca, gempa, dan berita seringkali berada di platform yang terpisah.

Masalah ini penting diselesaikan untuk mempercepat pengambilan keputusan evakuasi dan meningkatkan kesiapsiagaan mandiri masyarakat.

## Deskripsi Produk/Aplikasi
**Siaga (Bencana24/7)** adalah aplikasi *Disaster Intelligence* berbasis web yang dirancang untuk memberikan informasi bencana yang personal dan kontekstual. 

Produk ini berfungsi sebagai asisten cerdas yang mendampingi pengguna melalui:
- **Visualisasi Interaktif**: Mengubah angka koordinat menjadi titik di peta dengan indikator radius bahaya.
- **AI Analysis**: Menggunakan model bahasa besar (LLM) untuk memberikan interpretasi data keselamatan yang mudah dicerna (contoh: "Aman", "Waspada", atau "Bahaya").
- **Unified Info**: Mengintegrasikan data gempa, prakiraan cuaca, dan berita nasional dalam satu antarmuka modern yang responsif.

## Fitur Utama dan Teknologi yang Digunakan
### Fitur Utama
- **AI Assistant "Siaga"**: Chatbot cerdas berbasis Gemini 2.0 yang memberikan jawaban berbasis fakta dari data BMKG (bukan asumsi AI).
- **Interactive Map Focus**: Peta otomatis bergerak (panning) dan menandai lokasi bencana serta posisi referensi pengguna.
- **Intelligent Risk Assessment**: Perhitungan jarak otomatis (Great-circle distance) antara lokasi pengguna/permintaan dengan pusat gempa untuk menentukan status risiko secara presisi.
- **Real-time Weather Widgets**: Prakiraan cuaca detail per jam untuk lokasi yang ditanyakan.
- **Disaster News Integration**: Pencarian berita terkini melalui tool AI untuk menambah konteks situasi di lapangan.

### Teknologi yang Digunakan
- **Core**: HTML5, JavaScript (TypeScript), CSS3 (Modern Vanilla).
- **Frontend Framework**: React 19 & Vite (untuk performa ultra-cepat).
- **Mapping**: Leaflet.js dengan Tile layer kustom.
- **Animations**: Framer Motion & Lucide Icons untuk UI yang premium.
- **Backend/Serverless**: Cloudflare Workers (High-performance Edge Computing).
- **AI Model**: Gemini 2.0 Flash Lite (melalui antarmuka OpenAI-compatible).
- **Data Source**: BMKG Open Data (Gempa, Cuaca, Nowcast) & News RSS.

## Cara Penggunaan Product
1. **Akses Aplikasi**: Buka browser dan kunjungi [https://siaga-app.anonymousblack987.workers.dev](https://siaga-app.anonymousblack987.workers.dev).
2. **Pantau Peta**: Pada saat pertama kali dibuka, aplikasi akan menampilkan 15 gempa terbaru dan peringatan dini cuaca di seluruh Indonesia.
3. **Interaksi AI**:
   - Ketik pertanyaan di chat box bawah, misalnya: *"Gempa di Maluku tadi dampaknya ke Ambon gimana?"*
   - AI akan menganalisis jarak, kekuatan gempa, dan riwayat news (jika ada) untuk memberikan kesimpulan keamanan.
   - Peta akan otomatis fokus ke area Maluku dan Ambon.
4. **Cek Cuaca**: Tanyakan lokasi spesifik, misal: *"Besok di Surabaya hujan nggak?"* untuk memunculkan widget prakiraan cuaca 24 jam.
5. **Credential**: Tidak diperlukan login (Public Access).

## Informasi Pendukung [Opsional]
- **GitHub**: [Link ke repositori jika ada]
- **Dokumentasi API**: Mengacu pada [data.bmkg.go.id](https://data.bmkg.go.id).
- **Rencana Mendatang**: 
  - Implementasi Push Notification melalui browser.
  - Integrasi data tinggi muka air (banjir) dari wilayah terkait.
  - Dukungan multibahasa untuk wisatawan asing di Indonesia.
