# Bencana24/7 🌋🏡  
### *Disaster Intelligence for Everyone*

**Bencana24/7** adalah aplikasi *Disaster Intelligence* berbasis web yang dirancang untuk memberikan informasi bencana yang personal dan kontekstual bagi masyarakat Indonesia. Di wilayah "Ring of Fire", kecepatan dan kejelasan informasi adalah kunci keselamatan. Aplikasi ini mengubah data teknis menjadi panduan yang mudah dipahami.

---

## ⚠️ Problem Statement
Indonesia merupakan wilayah "Ring of Fire" dengan frekuensi bencana alam (gempa bumi dan cuaca ekstrem) yang sangat tinggi. Permasalahan utama yang dihadapi masyarakat adalah:
* **Informasi Teknis yang Rumit**: Data dari otoritas seringkali teknis (koordinat, magnitude, MB) yang sulit dipahami dampaknya secara instan oleh warga awam.
* **Kurangnya Personalisasi**: Masyarakat sering bertanya *"Apakah lokasi saya saat ini aman?"* namun harus membandingkan sendiri jarak mereka dengan pusat bencana.
* **Fragmentasi Informasi**: Informasi cuaca, gempa, dan berita seringkali berada di platform yang terpisah.

---

## 🚀 Deskripsi Produk
Bencana24/7 berfungsi sebagai asisten cerdas yang mendampingi pengguna melalui:
1. **Visualisasi Kontekstual**: Mengubah angka koordinat menjadi titik di peta dengan indikator radius bahaya.
2. **Interpretasi AI**: Menggunakan model bahasa besar (LLM) untuk memberikan interpretasi data keselamatan yang mudah dicerna (contoh: "Aman", "Waspada", atau "Bahaya").
3. **Sentralisasi Data**: Mengintegrasikan data gempa, prakiraan cuaca, dan berita nasional dalam satu antarmuka modern yang responsif.

---

## ✨ Fitur Utama
- 🤖 **Chatbot Cerdas**: Memberikan jawaban berbasis fakta dari data BMKG (bukan asumsi AI).
- 🗺️ **Peta Interaktif**: Panning otomatis ke lokasi bencana serta menandai posisi referensi pengguna.
- 📏 **Kalkulasi Risiko Presisi**: Perhitungan jarak otomatis (*Great-circle distance*) antara lokasi pengguna dengan pusat gempa untuk menentukan status risiko secara akurat.
- 🌦️ **Widget Cuaca Detail**: Prakiraan cuaca per jam untuk lokasi yang ditanyakan.
- 📰 **Berita Terkini**: Pencarian berita otomatis melalui tool AI untuk menambah konteks situasi di lapangan.

---

## 🛠️ Tech Stack
- **Core**: HTML5, JavaScript (TypeScript), CSS3 (Modern Vanilla).
- **Frontend Framework**: [React 19](https://react.dev/) & [Vite](https://vitejs.dev/) (Performa ultra-cepat).
- **Mapping**: [Leaflet.js](https://leafletjs.com/) dengan Tile layer kustom.
- **Backend/Serverless**: [Cloudflare Workers](https://workers.cloudflare.com/) (High-performance Edge Computing).
- **AI Model**: Gemini 2.0 Flash Lite (melalui antarmuka OpenAI-compatible).
- **Data Source**: BMKG Open Data (Gempa, Cuaca, Nowcast) & Google News RSS.

---

## 📖 Cara Penggunaan 
1. **Akses Aplikasi**: Kunjungi [Bencana24/7 Web App](https://siaga-app.anonymousblack987.workers.dev).
2. **Pantau Peta**: Aplikasi akan menampilkan gempa terbaru dan peringatan dini cuaca di seluruh Indonesia saat pertama kali dibuka.
3. **Interaksi AI**:
   - Ketik pertanyaan di chat box, contoh: *"Gempa di Maluku tadi dampaknya ke Ambon gimana?"*
   - AI akan menganalisis jarak, kekuatan gempa, dan berita terkini untuk memberikan kesimpulan keamanan.
   - Peta akan otomatis fokus ke area yang disebutkan.
4. **Cek Cuaca**: Tanyakan lokasi spesifik, misal: *"Besok di Surabaya hujan nggak?"* untuk memunculkan widget prakiraan cuaca 24 jam.

---

## 🔌 Informasi Pendukung
- **Dokumentasi API**: [BMKG Data](https://data.bmkg.go.id) & [Google News RSS](https://news.google.com/rss)
- **Deployment**: Backend di Cloudflare Workers & Frontend via Vercel/Cloudflare Pages.

---
*Created with ❤️ for Safety in Indonesia.*
