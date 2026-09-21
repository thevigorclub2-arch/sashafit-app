// Демо-режим SashaFit: імітація Supabase в памʼяті з тестовими даними.
// Відкривається за адресою ...?demo=client або ...?demo=coach. Нічого не зберігає між перезавантаженнями.
(function () {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const today = () => iso(new Date());
  const monday = s => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  let counter = 0;
  const uid = p => p + (++counter) + 'x';
  const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

  const FOODS = [
    ['Куряче філе, варене',165,31,3.6,0,150],['Індичка, філе',135,30,1,0,150],['Лосось, запечений',208,20,13,0,130],
    ['Тунець у власному соку',116,26,1,0,100],['Яйце куряче',155,13,11,1.1,55],['Сир кисломолочний 5%',121,17,5,1.8,150],
    ['Йогурт грецький',73,10,2,4,150],['Молоко 2,5%',52,2.8,2.5,4.7,200],['Сир твердий',350,25,27,0,30],
    ['Гречка, варена',92,3.4,0.6,20,200],['Рис, варений',130,2.7,0.3,28,180],['Вівсянка на воді',71,2.5,1.5,12,250],
    ['Макарони, варені',158,5.8,0.9,31,180],['Картопля, варена',86,1.9,0.1,20,200],['Хліб цільнозерновий',247,13,3.4,41,40],
    ['Квасоля, варена',127,8.7,0.5,23,150],['Сочевиця, варена',116,9,0.4,20,150],['Броколі, варена',35,2.4,0.4,7,150],
    ['Шпинат',23,2.9,0.4,3.6,80],['Огірок',15,0.7,0.1,3.6,120],['Помідор',18,0.9,0.2,3.9,120],['Банан',89,1.1,0.3,23,120],
    ['Яблуко',52,0.3,0.2,14,180],['Лохина',57,0.7,0.3,14,100],['Авокадо',160,2,15,9,100],['Мигдаль',579,21,50,22,30],
    ['Арахісова паста',588,25,50,20,20],['Оливкова олія',884,0,100,0,10],['Мед',304,0.3,0,82,20],
    ['Протеїн, порошок',400,80,6,8,30],['Борщ',49,1.6,2.2,6,300],['Вареники з картоплею',190,5,4,34,200],['Сирники',220,15,9,20,120]
  ];

  const EX = [
    ['e1','Румунська тяга','Сідниці','Спина рівна, гриф близько до ніг'],['e2','Болгарські випади','Ноги',''],
    ['e3','Жим ногами','Ноги',''],['e4','Місток з обтяженням','Сідниці','Пауза 1 секунда вгорі'],
    ['e5','Присідання з гантеллю','Ноги',''],['e6','Жим гантелей лежачи','Груди',''],['e7','Тяга блока до грудей','Спина',''],
    ['e8','Жим гантелей стоячи','Плечі',''],['e9','Розведення на задню дельту','Плечі',''],['e10','Тяга гантелі в нахилі','Спина',''],
    ['e11','Планка (секунди)','Кор',''],['e12','Присідання з паузою','Ноги',''],['e13','Віджимання від лави','Руки',''],
    ['e14','Випади назад','Ноги',''],['e15','Ягодичний місток','Сідниці',''],['e16','Скручування','Кор','']
  ];
  const PROGS = [
    ['p1','Ноги та сідниці',[['p1w1','День 1: сідниці',[['e4',4,12,50],['e1',3,10,40],['e14',3,12,8],['e16',3,15,0]]],
                             ['p1w2','День 2: ноги',[['e1',3,10,40],['e2',3,10,10],['e3',3,12,80],['e4',4,12,50]]]]],
    ['p2','Верх тіла',[['p2w1','Верх тіла',[['e6',3,10,14],['e7',3,12,35],['e8',3,10,8],['e9',3,15,5]]]]],
    ['p3','Фулбоді',[['p3w1','Фулбоді А',[['e5',3,12,16],['e6',3,10,12],['e10',3,12,14],['e11',3,40,0]]]]],
    ['p4','Дім без обладнання',[['p4w1','Дім',[['e12',3,15,0],['e13',3,12,0],['e14',3,12,0],['e15',4,20,0]]]]]
  ];
  // id, ім'я, ціль, тариф, програма, днів до кінця підписки, норма, вага[], талія[], сесій, є check-in цього тижня, відгук
  const CLIENTS = [
    ['c1','Олена Коваль','Схуднення, ціль −6 кг','Супровід 3 міс','p1',38,[1750,120,55,190],[72.4,71.9,71.5,71.2,70.8,70.5],[80,79.5,79,78.5,78,77.5],6,false],
    ['c2','Марія Гнатюк','Набір форми','Супровід 1 міс','p2',3,[2100,110,65,250],[58.2,58.0,58.4,58.3,58.6],[66,66,65.5,65.5,66],5,true],
    ['c3','Ірина Мельник','Підтягнути тіло','Супровід 1 міс','p3',-2,[1650,105,52,180],[66.0,65.8,65.9,65.7],[74,74,73.5,73.5],2,false],
    ['c4','Соломія Бондар','Сила та витривалість','Супровід 3 міс','p4',21,[1900,115,60,215],[62.0,61.7,61.5,61.2],[71,70.5,70,70],4,true],
    ['c5','Катерина Шевчук','Схуднення, ціль −4 кг','Супровід 1 міс','p3',9,[1600,100,50,175],[69.5,69.2,69.0,68.9],[77,76.5,76.5,76],3,false],
    ['c6','Оксана Ткач','Набір форми','Супровід 6 міс','p2',52,[2000,105,62,240],[54.6,54.8,54.9,55.1],[64,64,64,64],4,true]
  ];

  function seed() {
    const T = { profiles: [], exercises: [], programs: [], program_workouts: [], workout_items: [], clients: [], intake: [],
      workout_sessions: [], set_logs: [], foods: [], food_entries: [], checkins: [], payments: [],
      coach_settings: [{ id: true, remind_checkin: true, remind_pay: true, remind_workout: false, checkin_weekday: 7, checkin_hour: 10 }],
      reminders_log: [] };
    const now = new Date().toISOString();
    EX.forEach(e => T.exercises.push({ id: e[0], name: e[1], muscle_group: e[2], video_url: null, note: e[3] || null, image_path: ['e1', 'e2', 'e3', 'e4'].indexOf(e[0]) !== -1 ? 'demo/' + e[0] + '.svg' : null, created_at: now }));
    PROGS.forEach(p => {
      T.programs.push({ id: p[0], name: p[1], created_at: now });
      p[2].forEach((w, wi) => {
        T.program_workouts.push({ id: w[0], program_id: p[0], position: wi, name: w[1] });
        w[2].forEach((it, ii) => T.workout_items.push({ id: uid('i'), workout_id: w[0], position: ii, exercise_id: it[0], sets: it[1], reps: it[2], weight_kg: it[3] }));
      });
    });
    FOODS.forEach((f, i) => T.foods.push({ id: 'f' + i, name: f[0], kcal_100: f[1], protein_100: f[2], fat_100: f[3], carbs_100: f[4], default_g: f[5], source: 'seed', external_id: 'seed-' + i, owner_client_id: null, created_at: now }));

    const t0 = today();
    CLIENTS.forEach((c, ci) => {
      const end = addDays(t0, c[5]);
      T.profiles.push({ id: 'u' + (ci + 1), telegram_id: 1000 + ci, role: 'client', full_name: c[1], username: null });
      T.clients.push({ id: c[0], profile_id: 'u' + (ci + 1), invite_code: 'demo' + (ci + 1), name: c[1], goal: c[2], tariff: c[3],
        sub_start: addDays(end, -30), sub_end: end, program_id: c[4], next_workout: 0, workouts_plan: 3,
        norm_kcal: c[6][0], norm_protein: c[6][1], norm_fat: c[6][2], norm_carbs: c[6][3], created_at: now });
      if (c[0] !== 'c1') {
        T.intake.push({ client_id: c[0], goal: c[2].indexOf('Схуднення') === 0 ? 'Схуднення' : "Набір м'язів", experience: 'Середній', days_per_week: 3,
          place: c[0] === 'c4' ? 'Вдома' : 'Зал', age: 25 + ci * 2, height_cm: 165 + ci, target_weight_kg: null,
          injuries: c[0] === 'c3' ? 'Періодично болить ліве коліно' : null, diet_notes: null, completed_at: now });
      }
      T.payments.push({ id: uid('pay'), client_id: c[0], paid_on: addDays(end, -30), months: 1, amount: null, note: null });
      // тренування
      const prog = PROGS.find(p => p[0] === c[4]);
      for (let k = 0; k < c[9]; k++) {
        const w = prog[2][k % prog[2].length];
        const sid = uid('s');
        let sets = 0, vol = 0;
        const logs = [];
        w[2].forEach(it => {
          for (let s = 0; s < it[1]; s++) {
            const kg = it[3] + (k > 2 ? 2 : 0);
            sets++; vol += kg * it[2];
            logs.push({ id: uid('l'), session_id: sid, client_id: c[0], exercise_id: it[0], exercise_name: (EX.find(e => e[0] === it[0]) || [])[1], set_no: s + 1, weight_kg: kg, reps: it[2], done: true });
          }
        });
        T.workout_sessions.push({ id: sid, client_id: c[0], workout_id: w[0], title: prog[1] + ' · ' + w[1], performed_on: addDays(t0, -(c[9] - k) * 3 + 1), total_sets: sets, volume_kg: Math.round(vol), created_at: now });
        logs.forEach(l => T.set_logs.push(l));
      }
      // check-in'и
      const ws = c[7], wa = c[8], L = ws.length;
      ws.forEach((w, i) => {
        const offset = c[10] ? -(L - 1 - i) : -(L - i);
        const isThisWeek = offset === 0;
        const withFb = !(isThisWeek && (c[0] === 'c2' || c[0] === 'c6'));
        T.checkins.push({ id: uid('k'), client_id: c[0], week_start: monday(addDays(t0, offset * 7)), weight_kg: w, waist_cm: wa[i], hips_cm: 92 + ci,
          mood: 3 + (i % 3), comment: isThisWeek ? 'Загалом непогано, тренування не пропускала.' : null,
          photo_paths: isThisWeek ? [c[0] + '/f.jpg', c[0] + '/s.jpg', ''] : ['', '', ''],
          coach_feedback: withFb ? (c[0] === 'c4' && isThisWeek ? 'Класний тиждень! У наступному додай по 2 кг у станових вправах.' : 'Супер, продовжуємо в тому ж дусі.') : null,
          feedback_at: withFb ? now : null, created_at: now });
      });
    });
    // харчування Олени на сьогодні
    const fe = (meal, name, g) => { const f = FOODS.find(x => x[0] === name); T.food_entries.push({ id: uid('n'), client_id: 'c1', eaten_on: t0, meal, food_name: name, grams: g,
      kcal: Math.round(f[1] * g / 100), protein: Math.round(f[2] * g / 10) / 10, fat: Math.round(f[3] * g / 10) / 10, carbs: Math.round(f[4] * g / 10) / 10, created_at: now }); };
    fe('b', 'Вівсянка на воді', 250); fe('b', 'Яйце куряче', 110); fe('l', 'Куряче філе, варене', 150); fe('l', 'Гречка, варена', 200);
    return T;
  }

  function overview(T) {
    const wk = monday(today());
    return T.clients.map(c => ({
      id: c.id, name: c.name, goal: c.goal, tariff: c.tariff, sub_end: c.sub_end,
      days_left: c.sub_end ? Math.round((parse(c.sub_end) - parse(today())) / 86400000) : null,
      intake_done: T.intake.some(i => i.client_id === c.id && i.completed_at),
      checkin_this_week: T.checkins.some(k => k.client_id === c.id && k.week_start === wk),
      awaiting_feedback: T.checkins.some(k => k.client_id === c.id && !k.coach_feedback),
      sessions_this_week: T.workout_sessions.filter(s => s.client_id === c.id && s.performed_on >= wk).length,
      workouts_plan: c.workouts_plan
    }));
  }

  const DEFAULTS = {
    workout_sessions: () => ({ performed_on: today(), total_sets: 0, volume_kg: 0 }),
    clients: () => ({ invite_code: Math.random().toString(16).slice(2, 12), profile_id: null, next_workout: 0, workouts_plan: 3 }),
    checkins: () => ({ photo_paths: [], coach_feedback: null, feedback_at: null }),
    food_entries: () => ({ eaten_on: today() }),
    payments: () => ({ paid_on: today(), months: 1 }),
    foods: () => ({ default_g: 100, source: 'custom', owner_client_id: null })
  };

  function createDemoClient() {
    const T = seed();
    class Q {
      constructor(t) { this.t = t; this.op = 'select'; this.filters = []; this.orders = []; this.lim = null; this.mode = 'many'; this.payload = null; this.opts = {}; this.ret = false; }
      select() { if (this.op !== 'select') this.ret = true; return this; }
      insert(p) { this.op = 'insert'; this.payload = p; return this; }
      update(p) { this.op = 'update'; this.payload = p; return this; }
      upsert(p, o) { this.op = 'upsert'; this.payload = p; this.opts = o || {}; return this; }
      delete() { this.op = 'delete'; return this; }
      eq(c, v) { this.filters.push(r => r[c] === v); return this; }
      in(c, a) { this.filters.push(r => a.indexOf(r[c]) !== -1); return this; }
      gte(c, v) { this.filters.push(r => r[c] >= v); return this; }
      lte(c, v) { this.filters.push(r => r[c] <= v); return this; }
      is(c, v) { this.filters.push(r => (r[c] == null ? null : r[c]) === v); return this; }
      ilike(c, p) { const s = String(p).replace(/%/g, '').toLowerCase(); this.filters.push(r => String(r[c] || '').toLowerCase().indexOf(s) !== -1); return this; }
      order(c, o) { this.orders.push([c, !(o && o.ascending === false)]); return this; }
      limit(n) { this.lim = n; return this; }
      maybeSingle() { this.mode = 'maybe'; return this; }
      single() { this.mode = 'single'; return this; }
      then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
      source() { return this.t === 'client_overview' ? overview(T) : T[this.t]; }
      finish(rows) {
        let out = rows;
        if (this.mode === 'many') return { data: clone(out), error: null };
        if (this.mode === 'maybe') return { data: clone(out[0] || null), error: null };
        if (!out[0]) return { data: null, error: { message: 'no rows', code: 'PGRST116' } };
        return { data: clone(out[0]), error: null };
      }
      run() {
        const t = this.t, src = this.source();
        if (!src) return { data: null, error: { message: 'unknown table ' + t } };
        const match = r => this.filters.every(f => f(r));
        if (this.op === 'select') {
          let rows = src.filter(match);
          this.orders.slice().reverse().forEach(o => { rows = rows.slice().sort((a, b) => (a[o[0]] < b[o[0]] ? -1 : a[o[0]] > b[o[0]] ? 1 : 0) * (o[1] ? 1 : -1)); });
          if (this.lim != null) rows = rows.slice(0, this.lim);
          return this.finish(rows);
        }
        const now = new Date().toISOString();
        const mkRow = p => Object.assign({ id: uid(t.slice(0, 2)), created_at: now }, DEFAULTS[t] ? DEFAULTS[t]() : {}, p);
        if (this.op === 'insert') {
          const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
          const rows = arr.map(mkRow);
          rows.forEach(r => src.push(r));
          return this.ret ? this.finish(rows) : { data: null, error: null };
        }
        if (this.op === 'upsert') {
          const key = this.opts.onConflict, p = this.payload;
          const ex = key ? src.find(r => r[key] === p[key]) : null;
          if (ex) { Object.assign(ex, p); return this.ret ? this.finish([ex]) : { data: null, error: null }; }
          const row = mkRow(p); src.push(row);
          return this.ret ? this.finish([row]) : { data: null, error: null };
        }
        if (this.op === 'update') {
          const rows = src.filter(match);
          rows.forEach(r => Object.assign(r, this.payload));
          return this.ret ? this.finish(rows) : { data: null, error: null };
        }
        if (this.op === 'delete') {
          if (t === 'exercises') {
            const used = src.filter(match).some(e => T.workout_items.some(i => i.exercise_id === e.id));
            if (used) return { data: null, error: { code: '23503', message: 'foreign key violation' } };
          }
          const rows = src.filter(match);
          rows.forEach(r => { const i = src.indexOf(r); if (i !== -1) src.splice(i, 1); });
          if (t === 'program_workouts') rows.forEach(w => { T.workout_items = T.workout_items.filter(i => i.workout_id !== w.id); T.workout_sessions.forEach(s => { if (s.workout_id === w.id) s.workout_id = null; }); });
          return { data: null, error: null };
        }
        return { data: null, error: { message: 'unsupported' } };
      }
    }
    const files = {};
    const svg = label => 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#D7EEEA"/><text x="150" y="205" font-size="18" text-anchor="middle" fill="#0F766E" font-family="sans-serif">' + label + '</text></svg>');
    return {
      __demo: true,
      __meId: 'c1',
      from: t => new Q(t),
      rpc: async () => ({ data: 'c1', error: null }),
      storage: { from: bucket => ({
        upload: async (p, blob) => { try { files[p] = URL.createObjectURL(blob); } catch (e) { /* ігноруємо */ } return { data: { path: p }, error: null }; },
        remove: async ps => { ps.forEach(x => { delete files[x]; }); return { data: null, error: null }; },
        createSignedUrl: async () => ({ data: { signedUrl: svg('фото') }, error: null }),
        getPublicUrl: p => ({ data: { publicUrl: files[p] || svg(bucket === 'exercise-images' ? 'вправа' : 'фото') } })
      }) }
    };
  }
  window.createDemoClient = createDemoClient;
})();
