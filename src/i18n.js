/*
 * Sweet Home — translations.
 * `t('English text', a, b…)` returns the text in the card's language ({0}, {1}… are filled in). Text without a
 * translation stays English. The language is the card's `language` option, else the user's Home Assistant language.
 * Arabic (and the other right-to-left languages) also turn the layout around.
 */
const AR = {
  // tabs, 3D view
  Home: 'الرئيسية', Security: 'الأمان', Climate: 'المناخ', Energy: 'الطاقة', 'Water & Garden': 'المياه والحديقة', Media: 'الوسائط', System: 'النظام',
  Lights: 'الإضاءة', Presence: 'التواجد', 'Live 3D view · tap a room': 'عرض ثلاثي الأبعاد مباشر · اضغط على أي غرفة', 'Live 3D view': 'عرض ثلاثي الأبعاد مباشر', 'Building your home…': 'جارٍ بناء منزلك…',
  'Top view': 'عرض علوي', '3D view': 'عرض ثلاثي الأبعاد', 'Auto-rotate': 'دوران تلقائي', 'Move furniture': 'تحريك الأثاث', Floors: 'الطوابق',
  occupied: 'مشغولة', empty: 'فارغة', 'lights on': 'إضاءة تعمل', off: 'مطفأة',
  'Good night': 'تصبح على خير', 'Good morning': 'صباح الخير', 'Good afternoon': 'مساء الخير', 'Good evening': 'مساء الخير',
  "Tap a room to see and control what's in it.": 'اضغط على أي غرفة لعرض أجهزتها والتحكم بها.', 'Furniture with a dot can be tapped too.': 'ويمكنك أيضًا الضغط على الأثاث الذي عليه نقطة.',
  'Long press any row for details.': 'اضغط مطوّلًا على أي صف لعرض التفاصيل.', 'Close hint': 'إغلاق التلميح',
  // header chips
  '{0} open': '{0} مفتوح', 'All doors closed': 'كل الأبواب مغلقة', '{0} unlocked': '{0} غير مقفل', '1 light on': 'ضوء واحد يعمل', '{0} lights on': '{0} أضواء تعمل',
  '{0}° inside': '{0}° في الداخل', '{0} now': '{0} الآن',
  // at a glance
  'At a glance': 'نظرة سريعة', 'Power now': 'الاستهلاك الآن', 'Water Tank': 'خزان المياه', Car: 'السيارة', Cameras: 'الكاميرات', TV: 'التلفاز', 'Home Lab': 'المختبر المنزلي',
  '{0} open / unlocked': '{0} مفتوح / غير مقفل', 'All closed & locked': 'الكل مغلق ومقفل', '{0} AC running': '{0} مكيّف يعمل', 'All ACs off': 'كل المكيفات مطفأة', 'Today {0}': 'اليوم {0}',
  'Pump running': 'المضخة تعمل', 'Pumps idle': 'المضخات متوقفة', Charging: 'يشحن', 'Charger idle': 'الشاحن متوقف', '1 person': 'شخص واحد', '{0} persons': '{0} أشخاص', 'All quiet': 'لا شيء جديد',
  '{0} cameras live': '{0} كاميرات مباشرة', Online: 'متصل', Offline: 'غير متصل',
  // alarm
  Disarmed: 'غير مفعّل', 'Armed away': 'مفعّل (خارج المنزل)', 'Armed home': 'مفعّل (في المنزل)', 'Armed night': 'مفعّل (ليلي)', Vacation: 'وضع السفر', 'Arming…': 'جارٍ التفعيل…', 'Pending…': 'قيد الانتظار…', TRIGGERED: 'إنذار!',
  // room popup
  Temperature: 'درجة الحرارة', Humidity: 'الرطوبة', Entrance: 'المدخل', Doors: 'الأبواب', Plugs: 'المقابس', Furniture: 'الأثاث', Devices: 'الأجهزة', Sensors: 'الحساسات', Other: 'أخرى',
  'Show {0} more': 'عرض {0} إضافية', 'Show less': 'عرض أقل', AC: 'المكيّف',
  'No devices mapped to this room yet. Link it to an area, or add entities in the card editor (Rooms → Entities).': 'لا توجد أجهزة مرتبطة بهذه الغرفة بعد. اربطها بمنطقة، أو أضف كيانات من محرر البطاقة (الغرف ← الكيانات).',
  On: 'يعمل', Off: 'مطفأ', Detected: 'تم الرصد', Clear: 'لا حركة', Open: 'مفتوح', Closed: 'مغلق', Locked: 'مقفل', Unlocked: 'غير مقفل', 'Locked · tap to unlock': 'مقفل · اضغط لفتح القفل',
  '{0} · tap to lock': '{0} · اضغط للقفل', 'Charging · {0} W': 'يشحن · {0} واط', 'On · idle': 'يعمل · خامل', 'People Detected': 'أشخاص مرصودون', Run: 'تشغيل', Running: 'قيد التشغيل',
  Activate: 'تفعيل', Press: 'ضغط', 'Not found': 'غير موجود', 'Open too long': 'مفتوح لفترة طويلة', 'At home': 'في المنزل', Away: 'خارج المنزل', Wet: 'رطب', Dry: 'جاف', Smoke: 'دخان',
  Gas: 'غاز', Low: 'منخفضة', Normal: 'طبيعية', 'Plugged in': 'موصول', Unplugged: 'غير موصول', Power: 'كهرباء', 'No power': 'لا كهرباء', Problem: 'مشكلة', OK: 'سليم',
  Connected: 'متصل', Disconnected: 'غير متصل', Vibration: 'اهتزاز', Still: 'ثابت',
  'Scene activated': 'تم تفعيل المشهد', 'Script started': 'بدأ تشغيل السكربت', Pressed: 'تم الضغط',
  // rename
  'Rename devices': 'إعادة تسمية الأجهزة', 'Rename · {0}': 'إعادة تسمية · {0}', Done: 'تم',
  'Names change in Home Assistant itself. Clear a name to go back to the default.': 'تتغير الأسماء في Home Assistant نفسه. امسح الاسم للعودة إلى الاسم الافتراضي.',
  'Nothing to rename here.': 'لا يوجد ما يمكن إعادة تسميته هنا.', "can't be renamed": 'لا يمكن إعادة تسميته', 'Renamed to {0}': 'تمت إعادة التسمية إلى {0}',
  'Back to the default name': 'تمت العودة إلى الاسم الافتراضي', 'Could not rename it': 'تعذّرت إعادة التسمية',
  // arrange
  'Drag furniture to move it. Tap the button again when done.': 'اسحب قطع الأثاث لتحريكها، ثم اضغط الزر مرة أخرى عند الانتهاء.', Moved: 'تم النقل',
  'This piece is automatic: change its room in the card editor (Furniture) to move it': 'هذه القطعة تلقائية: عدّل أثاث الغرفة من محرر البطاقة (الأثاث) لتتمكن من تحريكها',
  'Open the card editor to move furniture on this dashboard': 'افتح محرر البطاقة لتحريك الأثاث في هذه اللوحة',
  'Take control of this dashboard first (⋮ → Edit dashboard)': 'تولَّ التحكم في هذه اللوحة أولًا (⋮ ← تعديل اللوحة)', 'Could not save the dashboard': 'تعذّر حفظ اللوحة',
  // floors
  'Ground floor': 'الطابق الأرضي', Basement: 'القبو', 'Floor {0}': 'الطابق {0}',
  // furniture
  Bed: 'سرير', Sofa: 'كنبة', Table: 'طاولة', Chair: 'كرسي', Lamp: 'مصباح', 'Ceiling fan': 'مروحة سقف', Device: 'جهاز', Plant: 'نبتة', Rug: 'سجادة', Cabinet: 'خزانة',
  Counter: 'سطح عمل', Cylinder: 'أسطوانة', Ball: 'كرة', 'Phone charger': 'شاحن هاتف', Stairs: 'درج', Blinds: 'ستائر', 'Robot vacuum': 'مكنسة روبوت',
  // card editor
  Rooms: 'الغرف', Panels: 'اللوحات', Look: 'المظهر', Shape: 'الشكل', Entities: 'الكيانات', 'Doors & windows': 'الأبواب والنوافذ',
  Undo: 'تراجع', Redo: 'إعادة', Grid: 'الشبكة', '+ Add room': '+ إضافة غرفة', 'Add all my areas': 'إضافة كل مناطقي', '+ Add my other areas ({0})': '+ إضافة مناطقي الأخرى ({0})',
  Floor: 'الطابق', 'Add floor': 'إضافة طابق', 'Name of this floor': 'اسم هذا الطابق', 'Duplicate room': 'تكرار الغرفة', 'Delete room': 'حذف الغرفة', 'Delete rectangle': 'حذف المستطيل',
  '{0} rectangle(s)': '{0} مستطيل', 'Setup guide': 'دليل الإعداد', '{0} of 4 done': 'اكتمل {0} من 4', 'Hide the guide': 'إخفاء الدليل',
  'Add your rooms': 'أضف غرفك', 'Draw each room': 'ارسم كل غرفة', 'Check each room’s devices': 'راجع أجهزة كل غرفة', 'Add furniture': 'أضف الأثاث', 'Try it': 'جرّبه',
  'Open Shape': 'فتح الشكل', 'Open Entities': 'فتح الكيانات', 'Open Furniture': 'فتح الأثاث', 'Suggest furniture for all rooms': 'اقتراح أثاث لكل الغرف',
  '{0} thing to check': 'أمر واحد يحتاج مراجعة', '{0} things to check': '{0} أمور تحتاج مراجعة',
  'No rooms on this floor yet: add one, or add your areas.': 'لا توجد غرف في هذا الطابق بعد: أضف غرفة أو أضف مناطقك.',
  'Suggest furniture': 'اقتراح أثاث', 'Replace with a suggested set': 'استبدال بمجموعة مقترحة', 'Remove all': 'إزالة الكل', 'No furniture': 'بدون أثاث',
  Turn: 'تدوير', Duplicate: 'تكرار', Delete: 'حذف', Door: 'باب', Window: 'نافذة', 'Open passage': 'ممر مفتوح', 'Lock badge': 'شارة القفل', 'Back to automatic windows': 'العودة إلى النوافذ التلقائية',
  'found in area': 'من المنطقة', 'your list': 'قائمتك', 'Back to what the area has': 'العودة إلى أجهزة المنطقة', Add: 'إضافة', 'Also in this area:': 'أيضًا في هذه المنطقة:',
  'Any entity': 'أي كيان', 'Not in any room ({0})': 'خارج أي غرفة ({0})', 'tap to add here': 'اضغط للإضافة هنا', Search: 'بحث', 'None.': 'لا شيء.', Nothing: 'لا شيء',
  'Ceiling light': 'ضوء سقف', Spots: 'سبوتات', 'LED strip': 'شريط LED', 'TV backlight': 'إضاءة خلف التلفاز', Colours: 'الألوان', 'On / off only': 'تشغيل / إيقاف فقط',
  'Air conditioner / thermostat': 'المكيّف / منظم الحرارة', 'Motion & presence': 'الحركة والتواجد', Locks: 'الأقفال', Fan: 'المروحة', 'TV / media player': 'التلفاز / مشغل الوسائط',
  linked: 'مرتبط',
  'Hide this device here': 'إخفاء هذا الجهاز من هنا', 'Tap again to hide it': 'اضغط مرة أخرى لإخفائه',
  'Hidden. Show it again in the card editor (Panels → Needs Attention).': 'تم الإخفاء. يمكنك إظهاره مجددًا من محرر البطاقة (اللوحات ← يحتاج انتباهًا).',
  'Needs Attention': 'يحتاج انتباهًا', 'Hidden devices': 'الأجهزة المخفية', 'Hidden entities': 'الكيانات المخفية', 'Hidden from low batteries only': 'مخفية من البطاريات المنخفضة فقط',
  Pumps: 'المضخات', 'Other entities (valves, flow, pressure…)': 'كيانات أخرى (صمامات، تدفق، ضغط…)', 'Tank level': 'مستوى الخزان', 'Water quality': 'جودة المياه',
  'Water temperature': 'حرارة المياه', 'Battery alert below': 'تنبيه البطارية تحت', 'Weak Wi-Fi below': 'ضعف الواي فاي تحت', 'Cloudflare tunnels': 'أنفاق Cloudflare',
  'LED strip on': 'شريط LED على', 'Where there is no wall': 'حيث لا يوجد جدار', 'Keep going': 'يستمر', 'Stop at the gap': 'يتوقف عند الفراغ',
  North: 'الشمال', East: 'الشرق', South: 'الجنوب', West: 'الغرب', 'Strip on more than one rectangle: set its sides in YAML (strip_sides)': 'الشريط موزع على أكثر من مستطيل: حدّد جهاته في YAML (strip_sides)',
  Rename: 'إعادة تسمية', 'Name of {0}': 'اسم {0}', 'name in this card': 'اسم في هذه البطاقة فقط', 'can only be renamed in this card': 'يمكن إعادة تسميته في هذه البطاقة فقط', 'renamed in Home Assistant': 'تمت إعادة التسمية في Home Assistant', 'renamed in Home Assistant and on this dashboard': 'تمت إعادة التسمية في Home Assistant وفي هذه اللوحة',
  'default name': 'الاسم الافتراضي', 'could not rename': 'تعذّرت إعادة التسمية', 'not found': 'غير موجود',
  Parked: 'مركونة', Tree: 'شجرة', Hedge: 'سياج نباتي', Pool: 'مسبح', Sprinkler: 'رشاش مياه', Asphalt: 'أسفلت',
  'Stairs going': 'اتجاه الدرج', 'Up and down': 'صعود ونزول', 'No stairs': 'بدون درج', 'Car sensor (shows the car while it is parked)': 'حساس السيارة (تظهر السيارة عندما تكون مركونة)',
  'Valve or switch (sprays water while it is on)': 'صمام أو مفتاح (يرش الماء أثناء التشغيل)', 'Parking (asphalt)': 'موقف سيارات (أسفلت)', 'Trunk colour': 'لون الجذع',
  'Electric car': 'السيارة الكهربائية', 'This charge': 'هذا الشحن', 'This month': 'هذا الشهر', 'This year': 'هذا العام', charging: 'تشحن', 'charger idle': 'الشاحن متوقف',
  'Charging (on while it charges)': 'الشحن (يعمل أثناء الشحن)', 'Charging power': 'قدرة الشحن', 'Battery level': 'مستوى البطارية', Range: 'المدى',
  'Status (parked, driving…)': 'الحالة (مركونة، تسير…)', 'Charging time / time left': 'مدة الشحن / الوقت المتبقي', 'This charge: energy': 'هذا الشحن: الطاقة', 'This charge: cost': 'هذا الشحن: التكلفة',
  'This month: energy': 'هذا الشهر: الطاقة', 'This month: cost': 'هذا الشهر: التكلفة', 'This year: energy': 'هذا العام: الطاقة', 'This year: cost': 'هذا العام: التكلفة',
  'Names change on this dashboard only. Clear a name to go back to the default.': 'تتغير الأسماء في هذه اللوحة فقط. امسح الاسم للعودة إلى الاسم الافتراضي.',
  'Names saved': 'تم حفظ الأسماء', 'name on this dashboard': 'اسم في هذه اللوحة',
  'Only if the room is named Stairs': 'فقط إذا كان اسم الغرفة درج', 'Yes, by the floors': 'نعم، حسب الطوابق',
  // device states
  Playing: 'قيد التشغيل', Paused: 'متوقف مؤقتًا', Idle: 'خامل', Standby: 'في وضع الاستعداد', Buffering: 'جارٍ التحميل', Cleaning: 'ينظّف', Docked: 'في القاعدة',
  Returning: 'يعود إلى القاعدة', Error: 'خطأ', Opening: 'يُفتح', Closing: 'يُغلق', Unavailable: 'غير متاح', Unknown: 'غير معروف', Heat: 'تدفئة', Cool: 'تبريد', Auto: 'تلقائي', 'Fan only': 'مروحة فقط',
  // editor form fields
  'Home Assistant area (its devices are found on their own)': 'منطقة Home Assistant (تُكتشف أجهزتها تلقائيًا)', Name: 'الاسم', Icon: 'الأيقونة', 'Floor covering': 'أرضية الغرفة',
  'Outdoor (balcony, garden: no ceiling light, glass railing)': 'خارجية (شرفة، حديقة: بلا ضوء سقف، مع درابزين زجاجي)', 'Stairs (draws a flight of stairs in this room)': 'درج (يرسم درجًا في هذه الغرفة)',
  'Linked entities (tap the piece in 3D to control them)': 'الكيانات المرتبطة (اضغط على القطعة في العرض ثلاثي الأبعاد للتحكم بها)', 'Show a badge over it in 3D': 'إظهار شارة فوقها في العرض ثلاثي الأبعاد', Colour: 'اللون',
  Width: 'العرض', Depth: 'العمق', Height: 'الارتفاع', 'Height above the floor': 'الارتفاع عن الأرض', Length: 'الطول', 'Head of the bed': 'رأس السرير', 'Back side': 'جهة الظهر', Arms: 'المساند',
  Faces: 'الاتجاه', 'Screen faces': 'اتجاه الشاشة', Size: 'الحجم', Radius: 'نصف القطر', Direction: 'الاتجاه', Mode: 'الوضع', Steps: 'الدرجات',
  'Contact sensor (optional: the door opens in 3D while it is open)': 'حساس الفتح (اختياري: يُفتح الباب في العرض ثلاثي الأبعاد عند فتحه)', 'Main entrance': 'المدخل الرئيسي', Lock: 'القفل',
  Automatic: 'تلقائي', 'North (up)': 'الشمال (أعلى)', 'East (right)': 'الشرق (يمين)', 'South (down)': 'الجنوب (أسفل)', 'West (left)': 'الغرب (يسار)',
  'Swings one way': 'يُفتح في اتجاه', 'Swings the other way': 'يُفتح في الاتجاه الآخر', Both: 'الجهتان', Start: 'البداية', End: 'النهاية', None: 'لا شيء', Up: 'صعود', Down: 'نزول', Split: 'منقسم',
  'Along x': 'أفقي', 'Along z': 'عمودي', Wood: 'خشب', Tiles: 'بلاط', Marble: 'رخام', Carpet: 'سجاد', Stone: 'حجر', Grass: 'عشب',
  'Drag on an empty part of the grid to draw {0} (one square = {1} m). Drag again to add another rectangle (L-shapes). Drag a rectangle to move it, its corner dots to resize it. Tap another room to switch.':
    'اسحب على جزء فارغ من الشبكة لرسم {0} (المربع الواحد = {1} م). اسحب مرة أخرى لإضافة مستطيل آخر (لغرف على شكل L). اسحب المستطيل لتحريكه، ونقاط زواياه لتغيير حجمه. اضغط على غرفة أخرى للتبديل إليها.',
  "What {0} shows in its popup. Devices in its Home Assistant area are found on their own; remove what you don't want or add anything else.":
    'ما تعرضه {0} في نافذتها. تُكتشف أجهزة منطقتها في Home Assistant تلقائيًا؛ احذف ما لا تريده أو أضف ما تشاء.',
  'Tap the plan where it goes: {0}.': 'اضغط على المخطط حيث تريد وضعها: {0}.',
  'Pick a piece below, then tap the plan to place it. Drag a piece to move it and its corner dot to resize it. Link it to an entity so it can be tapped in the 3D view.':
    'اختر قطعة من الأسفل، ثم اضغط على المخطط لوضعها. اسحب القطعة لتحريكها ونقطة زاويتها لتغيير حجمها. اربطها بكيان لتتمكن من الضغط عليها في العرض ثلاثي الأبعاد.',
  'Drag along a wall to add a door. Pick its contact sensor to make it swing open in 3D.': 'اسحب على طول جدار لإضافة باب. اختر حساس الفتح الخاص به ليُفتح في العرض ثلاثي الأبعاد.',
  'Drag along an outer wall to add a window.': 'اسحب على طول جدار خارجي لإضافة نافذة.',
  'Drag along a wall between two rooms to open it (no wall, no doorway).': 'اسحب على طول جدار بين غرفتين لفتحه (بدون جدار ولا باب).',
  'Tap where a small lock badge should float.': 'اضغط حيث تريد وضع شارة القفل الصغيرة.',
  'One room per Home Assistant area is quickest. Each becomes a 4 × 4 m square you can reshape.': 'الأسرع: غرفة لكل منطقة في Home Assistant. تصبح كل منها مربعًا 4 × 4 م يمكنك تعديل شكله.',
  'In Shape mode, move and resize the squares into your floor plan. Draw more rectangles for L-shaped rooms.': 'في وضع الشكل، حرّك المربعات وغيّر حجمها لتطابق مخطط منزلك. ارسم مستطيلات إضافية للغرف على شكل L.',
  'Entities mode shows what every room found in its area. Remove extras, add what is missing.': 'يعرض وضع الكيانات ما وجدته كل غرفة في منطقتها. احذف الزائد وأضف الناقص.',
  'Suggest a set from the room names, then move pieces and link lamps, TVs or fans to their entities.': 'اقترح مجموعة أثاث حسب أسماء الغرف، ثم حرّك القطع واربط المصابيح والتلفاز والمراوح بكياناتها.',
  'The preview next to this editor updates as you go: tap a room or a piece there to see its popup.': 'تتحدث المعاينة بجانب المحرر أثناء العمل: اضغط على غرفة أو قطعة أثاث فيها لعرض نافذتها.',
  'Rooms are closed by walls: add a door or an opening wherever you can walk between them. Drag a door, window, opening or badge to move it.':
    'الغرف مغلقة بالجدران: أضف بابًا أو ممرًا مفتوحًا حيث يمكن التنقل بينها. اسحب الباب أو النافذة أو الممر أو الشارة لتحريكها.',
  'Windows are placed on long outer walls automatically. Add one to place them yourself.': 'تُضاف النوافذ تلقائيًا على الجدران الخارجية الطويلة. أضف نافذة لتحدد أماكنها بنفسك.',
  // room shapes and separate walls
  'Room shape': 'شكل الغرفة', 'Separate walls': 'جدران منفصلة', Rectangle: 'مستطيل', 'L shape': 'شكل L', 'T shape': 'شكل T', 'U shape': 'شكل U',
  'Cut corner': 'زاوية مائلة', 'Bay window': 'نافذة بارزة', 'Curved wall': 'جدار منحنٍ', Round: 'دائرية', Mirror: 'عكس', 'Delete corner': 'حذف الزاوية',
  'Edit corners': 'تعديل الزوايا', 'Free corners: slant or bend any wall': 'زوايا حرة: اجعل أي جدار مائلًا أو منحنيًا',
  '{0} corners. Drag a corner to move it. Drag the square in the middle of an edge to bend it into a curve, tap it to add a corner.':
    '{0} زوايا. اسحب الزاوية لتحريكها. اسحب المربع في منتصف الضلع لجعله منحنيًا، أو اضغط عليه لإضافة زاوية.',
  'These rectangles don’t touch: join them first.': 'هذه المستطيلات غير متلاصقة: اجعلها متصلة أولًا.',
  'Drag the corners of {0} to reshape it, drag inside it to move it. Pick a ready-made shape below to start over.': 'اسحب زوايا {0} لتغيير شكلها، واسحب من داخلها لتحريكها. اختر شكلًا جاهزًا بالأسفل للبدء من جديد.',
  'Drag on the grid to draw a separate wall, in any direction (one square = {0} m).': 'اسحب على الشبكة لرسم جدار منفصل بأي اتجاه (المربع الواحد = {0} م).',
  'Drag on the plan to draw a wall that stands on its own: a partition, a kitchen half wall, a glass screen, a curved garden wall. Tap a wall to change it, drag it or its ends to move it. Doors and openings cut it too.':
    'اسحب على المخطط لرسم جدار قائم بذاته: فاصل، أو جدار مطبخ منخفض، أو حاجز زجاجي، أو جدار حديقة منحنٍ. اضغط على الجدار لتعديله، واسحبه أو اسحب طرفيه لتحريكه. الأبواب والممرات تقطعه أيضًا.',
  '{0} separate wall(s) on this floor': '{0} جدار منفصل في هذا الطابق', Kind: 'النوع', Wall: 'جدار', 'Half wall': 'جدار منخفض', Glass: 'زجاج',
  'Height (m, empty: automatic)': 'الارتفاع (م، فارغ: تلقائي)', 'Bend (m, + one side, − the other)': 'الانحناء (م، + لجهة و− للأخرى)', 'Delete wall': 'حذف الجدار',
  // names on this dashboard
  'Names on this dashboard': 'الأسماء في لوحة التحكم هذه', 'No names yet.': 'لا توجد أسماء بعد.', 'Rename another entity': 'إعادة تسمية كيان آخر', 'Default name': 'الاسم الافتراضي', Panel: 'اللوحة',
  'Renamed in a room popup, on a panel (pencil while editing) or here. They replace the entity name everywhere on this dashboard; Home Assistant keeps its own names. Clear a name to go back to the default.':
    'تُعاد التسمية من نافذة الغرفة، أو من أي لوحة (رمز القلم أثناء التعديل)، أو من هنا. تحل الأسماء محل اسم الكيان في كل مكان في لوحة التحكم هذه، ويحتفظ Home Assistant بأسمائه الأصلية. امسح الاسم للعودة إلى الاسم الافتراضي.',
  // irrigation
  Watering: 'جارٍ الري', 'Valves (one per zone)': 'المحابس (واحد لكل منطقة)', 'Reminder notification': 'إشعار التذكير', 'Watering time': 'وقت الري',
  'Water every': 'الري كل', Schedule: 'الجدول', 'Day of the week': 'يوم الأسبوع', 'Water tomorrow (switch)': 'الري غدًا (مفتاح)', 'Next watering': 'الري القادم',
  'No valves yet: add them in the card editor (Panels → Irrigation).': 'لا توجد محابس بعد: أضفها من محرر البطاقة (اللوحات ← الري).',
  'Hide the “tap a room” tip': 'إخفاء تلميح “اضغط على أي غرفة”',
  // entrances
  'Gates, garage doors, barriers, shutters': 'البوابات، أبواب المرآب، الحواجز، الأبواب الدوّارة', 'Tap again to open': 'اضغط مرة أخرى للفتح', 'Tap again to close': 'اضغط مرة أخرى للإغلاق', 'Tap again to stop': 'اضغط مرة أخرى للإيقاف',
  'Opening {0}': 'جارٍ فتح {0}', 'Closing {0}': 'جارٍ إغلاق {0}', 'Stopping {0}': 'جارٍ إيقاف {0}', 'Tap to open': 'اضغط للفتح',
  // lock badge names
  'The name above the badge in the 3D view, on this dashboard only. Clear it to show the lock’s name.': 'الاسم فوق الشارة في العرض ثلاثي الأبعاد، في لوحة التحكم هذه فقط. امسحه لعرض اسم القفل.',
  'Name shown in 3D (empty: the lock’s name)': 'الاسم في العرض ثلاثي الأبعاد (فارغ: اسم القفل)', 'Show the name above the badge': 'عرض الاسم فوق الشارة',
  // empty home
  'No rooms yet': 'لا توجد غرف بعد',
  'Add areas in Home Assistant (Settings → Areas) and put your devices in them: each area becomes a room. Or draw your rooms yourself: edit the dashboard, then edit this card → Rooms.': 'أضف المناطق في Home Assistant (الإعدادات ← المناطق) وضع أجهزتك فيها: تصبح كل منطقة غرفة. أو ارسم غرفك بنفسك: عدّل لوحة التحكم، ثم عدّل هذه البطاقة ← الغرف.',
  'Your alarm, locks, temperatures, power, cameras and TV show up here once Home Assistant has them.': 'يظهر هنا نظام الإنذار والأقفال ودرجات الحرارة والطاقة والكاميرات والتلفاز عند توفرها في Home Assistant.',
  // gate sensors
  'Open / closed sensors': 'حساسات الفتح والإغلاق', Suggested: 'مقترح', 'Open / closed sensor': 'حساس الفتح والإغلاق', 'Second sensor (backup)': 'حساس ثانٍ (احتياطي)',
  'Tell each gate whether it is open: a door or contact sensor, or a camera that recognises the gate’s state (Frigate state classification: a sensor that reads open / closed). Add a second one as a backup.': 'حدّد لكل بوابة ما يخبر بحالتها: حساس باب أو تلامس، أو كاميرا تتعرف على حالة البوابة (تصنيف الحالة في Frigate: حساس يقرأ مفتوح / مغلق). أضف حساسًا ثانيًا كاحتياطي.',
  // modes
  'One-tap buttons on the Home tab: guests, holiday, scenes, scripts': 'أزرار بلمسة واحدة في التبويب الرئيسي: الضيوف، العطلة، المشاهد، السكربتات', 'Mode buttons (switches, helpers, scenes, scripts)': 'أزرار الأوضاع (مفاتيح، مساعدات، مشاهد، سكربتات)',
  Modes: 'الأوضاع',
  // devices panel
  'Batteries of phones, tablets, watches and other devices (System tab)': 'بطاريات الهواتف والأجهزة اللوحية والساعات وغيرها (تبويب النظام)',
  'Batteries to show (empty: every phone, tablet and watch with the Home Assistant app)': 'البطاريات المعروضة (فارغ: كل هاتف وجهاز لوحي وساعة عليها تطبيق Home Assistant)',
  // people
  People: 'الأشخاص', 'Who shows at the top, and each person’s phone panel (long press their picture)': 'من يظهر في الأعلى، ولوحة هاتف كل شخص (اضغط مطولًا على صورته)',
  'People at the top (empty: everyone)': 'الأشخاص في الأعلى (فارغ: الجميع)', 'Phone panel: leave every field empty to find them on the phone; once you pick one, only what you pick shows': 'لوحة الهاتف: اترك كل الحقول فارغة لتُكتشف من الهاتف؛ وعند اختيار أحدها يظهر ما تختاره فقط',
  'Name on the panel (empty: the phone’s name)': 'الاسم في اللوحة (فارغ: اسم الهاتف)', 'Phone tracker': 'متتبع الهاتف', Battery: 'البطارية', Address: 'العنوان', 'Ringer mode': 'وضع الرنين', 'Wi-Fi': 'الواي فاي',
  'More rows (any entity)': 'صفوف إضافية (أي كيان)', 'Buttons (ring the phone, find it, scripts…)': 'أزرار (رنين الهاتف، العثور عليه، سكربتات…)',
};
const DICTS = { ar: AR };
let DICT = null, LANG = 'en';
export function setLang(lang) { LANG = String(lang || 'en').toLowerCase(); DICT = DICTS[LANG.split('-')[0]] || null; }
export const lang = () => LANG;
export const isRTL = () => /^(ar|he|fa|ur)/.test(LANG);
export function t(s, ...a) {
  let x = (DICT && DICT[s]) ?? s;
  for (let i = 0; i < a.length; i++) x = x.split(`{${i}}`).join(String(a[i]));
  return x;
}
