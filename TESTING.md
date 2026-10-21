# Testing report (প্রকৃত অবস্থা)
এই পরিবেশে Firebase Emulator নামানো যায়নি (নেটওয়ার্ক বন্ধ), তাই rules ও অর্ডার ফ্লো **চালিয়ে দেখা হয়নি**। শুধু JS syntax-check হয়েছে। `PASS` লেখা হবে কেবল আপনি চালানোর পর।

| বিভাগ | টেস্ট | কোথায় | ফলাফল |
|---|---|---|---|
| Rules | সঠিক অর্ডার জমা; ২২কেজি=২৪০ ডেলিভারি; দুই পণ্য | `tests/rules.test.js` | NOT RUN |
| Rules | ভুল দাম/চার্জ/মোট, ১২ কেজি, inactive পণ্য, ডুপ্লিকেট পণ্য, paid দিয়ে শুরু, অতিরিক্ত ফিল্ড, ভুল ফোন, TrxID ছাড়া bKash, অর্ডার বন্ধ — প্রত্যাখ্যান | `tests/rules.test.js` | NOT RUN |
| Rules | anon অর্ডার পড়া/বদলানো নিষিদ্ধ; admin status বদলায়, total বদলাতে পারে না | `tests/rules.test.js` | NOT RUN |
| Storefront | লোড, কার্ট, checkout, নেটওয়ার্ক ব্যর্থতা ও retry, সফল অর্ডার | ম্যানুয়াল | NOT RUN |
| Admin | লগইন (Gmail+UID), অর্ডার স্ট্যাটাস/পেমেন্ট বদল, বাতিল, অন্য ইউজারে ব্লক, পণ্য সক্রিয়/নিষ্ক্রিয় | ম্যানুয়াল | NOT RUN |
| Deployment | GitHub Pages, Auth domain, আসল অর্ডার | ম্যানুয়াল | NOT RUN |
| Rules | ট্র্যাকিং: batch-এ তৈরি, একা তৈরি/ভুল total প্রত্যাখ্যাত, anon শুধু get, admin বদলায় | `tests/rules.test.js` | NOT RUN |
| Storefront/Admin | ট্র্যাকিং পেজ, WhatsApp লিংক, প্রিন্ট স্লিপ, অর্ডার ডিলিটে ট্র্যাকিংও মোছা | ম্যানুয়াল | NOT RUN |
| Rules | ডিসকাউন্ট (কার্যকর দাম মিলানো, আসল দামে প্রত্যাখ্যান, ভুল ডিসকাউন্ট), রিভিউ, নোট/কুরিয়ার | `tests/rules.test.js` | NOT RUN |
| Admin/Storefront | ডিসকাউন্ট ব্যাজ ও দাম, রিভিউ অনুমোদন, রিপোর্ট চার্ট, নতুন অর্ডারের শব্দ/ব্যাজ | ম্যানুয়াল | NOT RUN |
