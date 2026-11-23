/**
 * Daily Brief push notification copy per language. {n} is the length in minutes. The term for "Daily Brief" matches the Android
 * app's own daily_brief string in that language (res/values-*), so the push and the app say the same thing.
 * Machine-written, not reviewed by native speakers. English is the fallback for any other language.
 */
export interface DailyBriefPushCopy {
  readyTitle: string;
  readyBody: string;
  failTitle: string;
  failBody: string;
}

const C = (readyTitle: string, readyBody: string, failTitle: string, failBody: string): DailyBriefPushCopy => ({ readyTitle, readyBody, failTitle, failBody });

export const DAILY_BRIEF_PUSH: Record<string, DailyBriefPushCopy> = {
  en: C('☀️ Your Daily Brief is Ready', 'Your {n}-minute personalized briefing is ready to play.', 'Daily Brief Update', "We couldn't generate your brief today. Tap to try manually."),
  es: C('☀️ Tu resumen diario está listo', 'Tu resumen personalizado de {n} min ya puedes escucharlo.', 'Novedades del resumen diario', 'Hoy no pudimos generar tu resumen. Toca para intentarlo manualmente.'),
  fr: C('☀️ Votre résumé quotidien est prêt', 'Votre résumé personnalisé de {n} min est prêt à être écouté.', 'Résumé quotidien : mise à jour', "Nous n'avons pas pu générer votre résumé aujourd'hui. Touchez pour réessayer manuellement."),
  de: C('☀️ Dein Tagesbriefing ist fertig', 'Dein persönliches Briefing von {n} Min. ist bereit zum Abspielen.', 'Neuigkeiten zum Tagesbriefing', 'Dein Briefing konnte heute nicht erstellt werden. Tippe, um es manuell zu versuchen.'),
  pt: C('☀️ Seu resumo diário está pronto', 'Seu resumo personalizado de {n} min está pronto para ouvir.', 'Novidades do resumo diário', 'Não conseguimos gerar seu resumo hoje. Toque para tentar manualmente.'),
  it: C('☀️ Il tuo riepilogo quotidiano è pronto', 'Il tuo riepilogo personalizzato di {n} min è pronto da ascoltare.', 'Aggiornamento sul riepilogo quotidiano', 'Oggi non siamo riusciti a generare il tuo riepilogo. Tocca per riprovare manualmente.'),
  ja: C('☀️ デイリーブリーフの準備ができました', 'あなた専用の{n}分のブリーフィングを再生できます。', 'デイリーブリーフのお知らせ', '今日のブリーフを生成できませんでした。タップして手動で再試行してください。'),
  zh: C('☀️ 你的每日简报已就绪', '为你定制的{n}分钟简报已准备好，可以收听了。', '每日简报通知', '今天未能生成你的简报。点按即可手动重试。'),
  hi: C('☀️ आपका दैनिक सारांश तैयार है', 'आपका {n} मिनट का व्यक्तिगत सारांश सुनने के लिए तैयार है।', 'दैनिक सारांश अपडेट', 'आज हम आपका सारांश तैयार नहीं कर सके। मैन्युअल रूप से आज़माने के लिए टैप करें।'),
  ko: C('☀️ 일일 브리핑이 준비되었어요', '{n}분 분량의 맞춤 브리핑을 지금 들을 수 있어요.', '일일 브리핑 알림', '오늘은 브리핑을 만들지 못했어요. 탭해서 직접 다시 시도해 보세요.'),
  fil: C('☀️ Handa na ang iyong Araw-araw na Buod', 'Handa nang pakinggan ang iyong {n}-minutong buod na para sa iyo.', 'Update sa Araw-araw na Buod', 'Hindi namin nagawa ang iyong buod ngayon. I-tap para subukan nang mano-mano.'),
  cs: C('☀️ Váš denní přehled je připraven', 'Váš osobní {n}minutový přehled je připraven k přehrání.', 'Novinky k dennímu přehledu', 'Dnes se nepodařilo váš přehled vytvořit. Klepnutím to zkuste ručně.'),
  ro: C('☀️ Briefingul tău zilnic este gata', 'Briefingul tău personalizat de {n} min este gata de redat.', 'Actualizare briefing zilnic', 'Azi nu am reușit să generăm briefingul tău. Atinge pentru a încerca manual.'),
  sv: C('☀️ Din dagliga briefing är klar', 'Din personliga briefing på {n} min är redo att spelas upp.', 'Uppdatering om daglig briefing', 'Vi kunde inte skapa din briefing i dag. Tryck för att försöka manuellt.'),
  nl: C('☀️ Je dagelijkse samenvatting is klaar', 'Je persoonlijke samenvatting van {n} min staat klaar om af te spelen.', 'Update over je dagelijkse samenvatting', 'We konden je samenvatting vandaag niet maken. Tik om het handmatig te proberen.'),
  pl: C('☀️ Twój codzienny skrót jest gotowy', 'Twój spersonalizowany skrót na {n} min jest gotowy do odtworzenia.', 'Aktualizacja codziennego skrótu', 'Dziś nie udało się wygenerować Twojego skrótu. Dotknij, aby spróbować ręcznie.'),
  ru: C('☀️ Ваша ежедневная сводка готова', 'Ваша персональная сводка на {n} мин готова к воспроизведению.', 'Обновление ежедневной сводки', 'Сегодня не удалось создать вашу сводку. Нажмите, чтобы попробовать вручную.'),
  uk: C('☀️ Ваш щоденний брифінг готовий', 'Ваш персональний брифінг на {n} хв готовий до відтворення.', 'Оновлення щоденного брифінгу', 'Сьогодні не вдалося створити ваш брифінг. Торкніться, щоб спробувати вручну.'),
  hu: C('☀️ Elkészült a napi összefoglalód', 'A személyre szabott, {n} perces összefoglalód lejátszásra kész.', 'Napi összefoglaló – értesítés', 'Ma nem sikerült elkészíteni az összefoglalódat. Koppints a kézi újrapróbálkozáshoz.'),
  fi: C('☀️ Päivän katsauksesi on valmis', 'Henkilökohtainen {n} minuutin katsauksesi on valmis toistettavaksi.', 'Päivän katsauksen päivitys', 'Katsauksen luominen ei onnistunut tänään. Yritä manuaalisesti napauttamalla.'),
  tr: C('☀️ Günlük Özetin hazır', '{n} dakikalık kişisel özetin dinlemeye hazır.', 'Günlük Özet güncellemesi', 'Bugün özetin oluşturulamadı. Elle denemek için dokun.'),
  id: C('☀️ Ringkasan Harian Anda sudah siap', 'Ringkasan personal {n} menit Anda siap diputar.', 'Pembaruan Ringkasan Harian', 'Kami tidak dapat membuat ringkasan Anda hari ini. Ketuk untuk mencoba secara manual.'),
  el: C('☀️ Η ημερήσια ενημέρωσή σου είναι έτοιμη', 'Η προσωπική σου ενημέρωση {n} λεπτών είναι έτοιμη για αναπαραγωγή.', 'Ενημέρωση για την ημερήσια ενημέρωση', 'Δεν καταφέραμε να δημιουργήσουμε την ενημέρωσή σου σήμερα. Πάτα για να δοκιμάσεις χειροκίνητα.'),
  ar: C('☀️ ملخصك اليومي جاهز', 'ملخصك المخصص لمدة {n} دقيقة جاهز للتشغيل.', 'تحديث الملخص اليومي', 'تعذّر إنشاء ملخصك اليوم. اضغط للمحاولة يدويًا.'),
  ca: C('☀️ El teu resum diari està a punt', 'El teu resum personalitzat de {n} min ja es pot escoltar.', 'Novetats del resum diari', 'Avui no hem pogut generar el teu resum. Toca per provar-ho manualment.'),
  hr: C('☀️ Tvoj dnevni sažetak je spreman', 'Tvoj personalizirani sažetak od {n} min spreman je za reprodukciju.', 'Novosti o dnevnom sažetku', 'Danas nismo uspjeli izraditi tvoj sažetak. Dodirni za ručni pokušaj.'),
  ms: C('☀️ Ringkasan Harian anda sudah sedia', 'Ringkasan peribadi {n} minit anda sedia untuk dimainkan.', 'Kemas kini Ringkasan Harian', 'Kami tidak dapat menjana ringkasan anda hari ini. Ketik untuk cuba secara manual.'),
  no: C('☀️ Din daglige oppsummering er klar', 'Din personlige oppsummering på {n} min er klar til avspilling.', 'Oppdatering om daglig oppsummering', 'Vi klarte ikke å lage oppsummeringen din i dag. Trykk for å prøve manuelt.'),
  sk: C('☀️ Tvoj denný prehľad je pripravený', 'Tvoj osobný {n}-minútový prehľad je pripravený na prehratie.', 'Novinky k dennému prehľadu', 'Dnes sa nepodarilo vytvoriť tvoj prehľad. Klepnutím to skús ručne.'),
  sl: C('☀️ Tvoj dnevni povzetek je pripravljen', 'Tvoj osebni {n}-minutni povzetek je pripravljen za predvajanje.', 'Novice o dnevnem povzetku', 'Danes povzetka ni bilo mogoče ustvariti. Tapni za ročni poskus.'),
  sr: C('☀️ Tvoj dnevni rezime je spreman', 'Tvoj lični rezime od {n} min spreman je za puštanje.', 'Obaveštenje o dnevnom rezimeu', 'Danas nismo uspeli da napravimo tvoj rezime. Dodirni da pokušaš ručno.'),
  th: C('☀️ สรุปรายวันของคุณพร้อมแล้ว', 'สรุปแบบเฉพาะตัวความยาว {n} นาทีพร้อมให้เล่นแล้ว', 'อัปเดตสรุปรายวัน', 'วันนี้เราสร้างสรุปของคุณไม่ได้ แตะเพื่อลองใหม่ด้วยตนเอง'),
  vi: C('☀️ Bản tóm tắt hàng ngày của bạn đã sẵn sàng', 'Bản tóm tắt cá nhân hóa {n} phút của bạn đã sẵn sàng để phát.', 'Cập nhật tóm tắt hàng ngày', 'Hôm nay chúng tôi không thể tạo bản tóm tắt của bạn. Chạm để thử lại thủ công.'),
};
