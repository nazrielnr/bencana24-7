Data Prakiraan Cuaca Terbuka BMKG

Data prakiraan cuaca seluruh kelurahan dan desa di Indonesia dalam waktu 3 harian. Dalam 1 hari terdapat 8 data prakiraan cuaca (per 3 jam).

Format data: JSON
Jumlah data prakiraan: 3 hari
Jumlah data prakiraan dalam 1 hari: per 3 jam
Pemutakhiran data: 2 kali sehari
Lokasi kelurahan/desa: menggunakan kode wilayah administrasi tingkat IV dapat mengacu pada Keputusan Menteri Dalam Negeri Nomor 100.1.1-6117 Tahun 2022. Contoh: kode wilayah Kelurahan Kemayoran: 31.71.03.1001
Batas akses: 60 permintaan per menit per IP
Perhatian! Wajib untuk mencantumkan BMKG (Badan Meteorologi, Klimatologi, dan Geofisika) sebagai sumber data dan menampilkannya pada aplikasi/sistem Anda.
Akses API
$ curl https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4={kode_wilayah_tingkat_iv} $ curl https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=31.71.03.1001
Parameter (key)
utc_datetime: Waktu dalam UTC-YYYY-MM-DD HH:mm:ss
local_datetime: Waktu lokal-YYYY-MM-DD HH:mm:ss
t: Suhu Udara dalam °C
hu: Kelembapan Udara dalam %
weather_desc: Kondisi Cuaca dalam Indonesia
weather_desc_en: Kondisi Cuaca dalam English
ws: Kecepatan Angin dalam km/jam
wd: Arah Angin dari
tcc: Tutupan Awan dalam %
vs_text: Jarak Pandang dalam km
analysis_date: Waktu produksi data prakiraan cuaca dalam UTC-YYYY-MM-DDTHH:mm:ss

Data Gempabumi Terbuka BMKG

Data kejadian gempabumi yang terjadi di seluruh wilayah Indonesia. Terdapat 3 jenis data kejadian gempabumi, yaitu Gempabumi M 5.0+, Gempabumi Dirasakan, dan Gempabumi Berpotensi Tsunami.

Format data: XML, JSON, dan JPG
Jumlah data: 7
Pemutakhiran data: setiap ada peristiwa gempa
Batas akses: 60 permintaan per menit per IP
Perhatian! Wajib untuk mencantumkan BMKG (Badan Meteorologi, Klimatologi, dan Geofisika) sebagai sumber data dan menampilkannya pada aplikasi/sistem Anda.
Data Gempabumi
#	Data	Nama File	Tanggal Pemutakhiran	Ukuran Data
1	Gempabumi Terbaru	autogempa.xml	29 Mar 2026, 21:09:02 WIB	540 bytes
2	Gempabumi Terbaru	autogempa.json (https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json)	29 Mar 2026, 21:09:02 WIB	413 bytes
3	Daftar 15 Gempabumi M 5.0+	gempaterkini.xml	29 Mar 2026, 21:09:02 WIB	5531 bytes
4	Daftar 15 Gempabumi M 5.0+	gempaterkini.json (https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json)	29 Mar 2026, 21:09:02 WIB	4147 bytes
5	Daftar 15 Gempabumi Dirasakan	gempadirasakan.xml	29 Mar 2026, 21:09:02 WIB	5952 bytes
6	Daftar 15 Gempabumi Dirasakan	gempadirasakan.json (https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json)	29 Mar 2026, 21:09:02 WIB	4538 bytes
7	Gambar Shakemap	[kode_shakemap].jpg	-	-
Parameter (key)
Tanggal dan Jam dalam WIB
DateTime sesuai ISO 8601 dalam UTC (+00:00)
Magnitude atau magnitudo merupakan kekuatan gempa
Kedalaman dalam kilometer (km)
Koordinat Lintang dan Bujur
Susunan key coordinates adalah latitude kemudian longitude
Wilayah terdekat dengan lokasi episenter gempabumi
Potensi tsunami atau tidak, dan status gempa dirasakan
Dirasakan merupakan wilayah yang merasakan gempa dalam skala MMI
Gambar Shakemap (peta guncangan) diawali dengan URL https://static.bmkg.go.id/[kode_shakemap].jpg
Mengolah Data XML
Silakan gunakan kode baris pemrograman untuk mengolah data XML yang telah tersedia di portal Github BMKG https://github.com/infoBMKG/data-gempabumi

Data Peringatan Dini Cuaca Terbuka BMKG

Data peringatan dini cuaca (nowcast) di seluruh provinsi di Indonesia hingga level kecamatan. Data berbasis Common Alerting Protocol (CAP).

Format data: XML
Standar data: Common Alerting Protocol (CAP)
Validitas data: Terverifikasi valid di CAP Validator
Pemutakhiran data: setiap saat
Daftar data: RSS feed (XML) untuk daftar peringatan dini cuaca skala provinsi aktif di Indonesia
Data detail: CAP (XML) untuk detail wilayah kecamatan terdampak di provinsi tertentu
Bahasa: Tersedia dalam bahasa Indonesia dan English
Rujukan alert: Gunakan dokumen ini untuk arti: urgency, severity, and certainty
Batas akses: 60 permintaan per menit per IP
Perhatian! Wajib untuk mencantumkan BMKG (Badan Meteorologi, Klimatologi, dan Geofisika) sebagai sumber data dan menampilkannya pada aplikasi/sistem Anda.
Akses API/CAP
$ curl https://www.bmkg.go.id/alerts/nowcast/id $ curl https://www.bmkg.go.id/alerts/nowcast/en $ curl https://www.bmkg.go.id/alerts/nowcast/id/{kode_detail_cap}_alert.xml $ curl https://www.bmkg.go.id/alerts/nowcast/en/{kode_detail_cap}_alert.xml
Parameter (key) RSS Feed
title: Judul peringatan dini cuaca provinsi
link: Tautan detail CAP tiap provinsi
description: Deskripsi wilayah terdampak peringatan dini cuaca
author: Pembuat rilis peringatan dini cuaca
pubDate: Waktu publikasi lokal (RFC 1123)
lastBuildDate: Waktu pemutakhiran data UTC (RFC 1123)
Parameter (key) CAP Nowcast
event: Jenis kejadian peringatan dini cuaca
effective: Waktu mulai peringatan dini cuaca (ISO 8601)
expires: Waktu berakhir peringatan dini cuaca (ISO 8601)
senderName: Pembuat rilis peringatan dini cuaca
headline: Judul peringatan dini cuaca provinsi
description: Deskripsi wilayah peringatan dini cuaca terdampak
web: Tautan infografik peringatan dini cuaca
area: Polygon wilayah terdampak peringatan dini cuaca
Mengolah Data XML CAP
Silakan gunakan kode baris pemrograman untuk mengolah data XML CAP yang telah tersedia di portal Github BMKG https://github.com/infoBMKG/data-cap