# RetroLens 🖐️✨

> **Portal Filter Real-Time Menggunakan Gerakan Tangan (Web & Python)**

Bentangkan kedua tangan untuk membuka portal visual. Area di dalam portal akan diberi filter visual real-time (dual-tone, thermal, sketch, pixelate, glitch, cartoon, rainbow-wave, dll). Ganti filter secara instan cukup dengan melakukan **pinch jempol & kelingking**.

---

## 🌐 Cara Jalankan di Web (Browser)

Aplikasi web RetroLens 100% berjalan di sisi browser (**Client-Side**) menggunakan **MediaPipe JS** dan **HTML5 Canvas**, tanpa perlu backend server!

### 1. Jalankan di Komputer Lokal

Anda bisa menjalankan server lokal sederhana:

**Menggunakan Node.js / npx:**
```bash
npx serve .
```
atau
```bash
npx live-server
```

**Menggunakan Python:**
```bash
python -m http.server 8000
```
Lalu buka browser di `http://localhost:8000`.

---

## 🚀 Cara Hosting di GitHub Pages (Gratis)

Repositori ini sudah dilengkapi dengan konfigurasi otomatis untuk **GitHub Pages**.

### Langkah 1: Push ke GitHub
Pastikan semua file sudah di-push ke branch `main` atau `master` di repositori GitHub Anda:
```bash
git add .
git commit -m "Add RetroLens Web version and GitHub Pages workflow"
git push origin main
```

### Langkah 2: Aktifkan GitHub Pages di Repository
1. Buka repositori Anda di **GitHub.com**.
2. Masuk ke menu **Settings** (tab kanan atas repository).
3. Di sidebar kiri, klik **Pages** (di bagian *Code and automation*).
4. Pada opsi **Build and deployment**:
   - **Source**: Pilih **GitHub Actions** (Workflow akan otomatis mendeploy aplikasi).
   *(Atau pilih **Deploy from a branch**, lalu pilih branch **main** dan folder **/ (root)**, lalu klik **Save**).*
5. Tunggu 1–2 menit, link website RetroLens Anda akan muncul di bagian atas (contoh: `https://username.github.io/Retrolens/`).

---

## 🎮 Kontrol & Gestur Tangan

| Gestur / Tombol | Aksi |
| :--- | :--- |
| **Bentangkan 2 Tangan** 👐 | Membuka portal filter real-time di antara tangan |
| **Pinch Jempol + Kelingking** 🤏 | Mengganti ke filter visual berikutnya |
| **Kepalkan 2 Tangan** ✊ | Beralih antara **Mode 2D** dan **Mode 3D Multi-Mesh** |
| **Tombol `N` / `P`** ⌨️ | Next / Previous filter |
| **Tombol `C`** ⌨️ | Toggle Mode 2D / 3D |
| **Tombol `S`** 📸 | Mengambil screenshot / foto (download PNG otomatis) |
| **Tombol `F`** 🖥️ | Layar penuh (Fullscreen) |

---

## 🎨 11 Filter Visual yang Tersedia

1. **Dual-Tone**: Thresholding biner kontras tinggi (Cyberpunk Neon Orange & Violet).
2. **Thermal**: Simulasi sensor panas ilmiah (JET Colormap).
3. **Sketch**: Sketsa pensil klasik (Color Dodge Blur).
4. **Pixelate**: Efek mozaik 8-bit retro arcade.
5. **Glitch**: Pemisahan kanal RGB + scanlines digital.
6. **Invert**: Negatif spektrum warna.
7. **Red Channel**: Isolasi kanal merah murni.
8. **Edge Neon**: Deteksi garis tepi Sobel dengan gradien warna neon.
9. **Gaussian Blur**: Efek buram halus sinematik.
10. **Cartoon**: Komik bergaris tepi gelap (posterized color).
11. **Rainbow Wave**: Gelombang sinusoidal pelangi dinamis (HSV).

---

## 🐍 Menjalankan Versi Python (Opsional)

Jika ingin menjalankan engine Python OpenCV bawaan:
```bash
pip install -r requirements.txt
python Retrolens.py
```

---

## 📄 Lisensi
MIT License
