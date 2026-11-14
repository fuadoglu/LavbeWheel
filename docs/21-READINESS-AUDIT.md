# 🔬 İcraya hazırlıq auditi

Tarix: 14 noyabr 2026. Bu audit sənəd paketinin öz müəllifi tərəfindən aparılıb; müstəqil sertifikatlaşdırma deyil. Tətbiq hələ yoxdur. Qiymətləndirmə sənədlərin tamlığı və müqavilələrin dəqiqliyinə aiddir.

## Qərar

**Təməl quruluşa və dəqiq spesifikasiyası olan modullara başlamaq olar. Bütün sistemi heç bir əlavə müqavilə işi olmadan tam icra etməyə hazır, 10/10 paket kimi təqdim etmək düzgün deyil.** Əhatə və arxitektura müəyyənləşib, amma aşağıdakı açıq interfeys detalları təsirləndirdikləri modula başlamazdan əvvəl tamamlanmalıdır. Bunlar MVP icazəsi deyil; tam buraxılış meyarları qüvvədədir.

## Bu baxışda düzəldilənlər

| Tapıntı | Düzəliş | Sübut |
|---|---|---|
| Əsas README ingiliscə idi | Tam Azərbaycan dilinə keçirildi; ingiliscə versiya README.en.md-də saxlanıldı | README.md və dil keçidləri |
| Çəkili çarxda shuffled-cycle sxem tərəfindən qəbul edilirdi | Sxemdə qadağan edildi; müsbət/mənfi nümunə yoxlamaları əlavə edildi | wheel.schema.json və validator |
| Alətə aid olmayan range/teamCount/seats/game sahələri qəbul edilirdi | Əlaqəsiz alətlərdə qadağan edildi | Sxem və mənfi yoxlama |
| Rəqəm/komanda/bəli-xeyr rejim uyğunluğu qeyri-dəqiq idi | independent rejimi və iki bərabər aktiv bəli-xeyr seçimi müəyyənləşdirildi | Seçim sənədi və sxem |
| Admin sxeminin sintaksis yoxlamaları nümunə testləri ilə eyni sayda təqdim edilirdi | Yoxlama nəticəsində saylar ayrıldı | validate_contracts.py çıxışı |

## Hələ bağlanmalı texniki boşluqlar

| ID | Dərəcə | Dəqiq boşluq | Modula başlamazdan əvvəl tələb |
|---|---|---|---|
| RDY-01 | P1 | session.schema.json əsasən ad seçimi nəticəsini təsvir edir. Rəqəm, komanda bölgüsü və bütöv oyun vəziyyətinin ixracı üçün tam variantlar yoxdur | Nəticə növü üzrə ayrılan sxemlər; cari çarx konfiqurasiyası, dövr nömrəsi, aktiv kart, istifadə edilmiş kartlar, növbə və pauzanı əhatə edən tam ixrac zərfi; hər alət üçün nümunələr və bərpa testləri |
| RDY-02 | P1 | Admin OpenAPI-də DraftImport.records bəzi məzmun növlərində ümumi object-dir; UI/legal/SEO/preset/integration qeydlərinin ayrıca maşınla yoxlanan sxemləri yoxdur | Hər kind üçün allowlist sxem, müsbət/mənfi nümunə; mənbə versiyası və köhnəlmiş tərcümə davranışı; runner manifestinin dəqiq müqaviləsi |
| RDY-03 | P1 | Referens bütövlüyü, ID təkrarı, min≤max, komanda/yer uyğunluğu və qrafem limiti mətnlə tələb olunur, amma paylaşılmış TS/PHP validatoru hələ yoxdur | Eyni golden vektorlarla iki tərəfdə semantik yoxlama; sxem yoxlamasından ayrıca icra edilir |
| RDY-04 | P2 | Dizayn tokenləri və ekran vəziyyətləri var, amma təsdiqlənmiş bütün ekranların yüksək dəqiqlikli vizual nümunələri yoxdur | Mobil/planşet/kompüterdə əsas alət, butulka, oyun, hesabat və paylaşma ekranlarının iki mövzuda təsdiqi; əsas final ikon ixracları |

RDY-01/02 saxlamanın və admin importunun kor-koranə kodlanmasını bloklayır; alqoritmlər, ilkin qurulum və dizayn sistemi kimi müstəqil işləri bloklamır. RDY-03 implementasiya işi kimi ilk müqavilə moduluna daxildir. RDY-04 yekun UI işinə başlamazdan əvvəl həll edilir; sahibi təsdiqləmədiyi vizuala təsdiqlənmiş demək olmaz.

## Xarici girişlər və kontent

110 dil metadata-sı 110 hazır tərcümə deyil. 300 əsas oyun kartı və onların lokallaşdırılması hələ yaradılmayıb. Tərcümə/məzmun rəyləri, operator məlumatları, hosting, Google/CMP hesabları və reklam təsdiqi real buraxılış işləridir. Bunlar uydurularaq bağlanmır. Xarici girişlər [qərarlar sənədində](19-DECISIONS.md) izlənir.

## Yoxlamaların sərhədi

Sənəd keçidlərinin, JSON/SVG-nin və müqavilə nümunələrinin yoxlanması faydalıdır, amma real HTTP serverini, ekranları, təsadüfi seçim mühərrikini, hüquqi uyğunluğu və ya trafik potensialını yoxlamır. Admin sxem sintaksisinin keçməsi admin API-nin təhlükəsiz işlədiyinə sübut deyil.

## İcra sırasına təsir

1. WP01: qurulum; RDY-01/02 üçün müqavilə variantlarını və nümunələri tamamla, qərarları sənədləşdir.
2. WP02: alqoritmlər və RDY-03 semantik validatorları.
3. WP03: yalnız tam ixrac/bərpa müqaviləsi ilə saxlama.
4. WP04: RDY-04 vizual qərarlarını təsdiqləyib bütün ekranları qur.
5. Sonrakı iş paketlərini qəbul meyarları ilə davam etdir; bütün açıq maddələr bağlanmadan ictimai buraxılış yoxdur.

**Hazırlığın dürüst ifadəsi:** güclü və icraya başlanıla bilən baza; hələ tam boşluqsuz yekun mühəndislik paketi deyil. “10/10” əvəzinə bağlanmış maddələr və real yoxlama sübutları istifadə olunur.
