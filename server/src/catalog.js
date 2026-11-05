// Demo catalogue. Photos come from Unsplash (free licence), stored in public/img/products.
export const CATEGORIES = [
  ["Watches", "watches", "watch"],
  ["Cameras", "cameras", "camera"],
  ["Audio", "audio", "headphones"],
  ["Computers & Phones", "tech", "laptop"],
  ["Sneakers", "sneakers", "footprints"],
  ["Bags & Fashion", "bags", "shopping-bag"],
  ["Jewelry", "jewelry", "gem"],
  ["Instruments", "instruments", "guitar"],
  ["Cycling", "cycling", "bike"],
  ["Art", "art", "palette"],
  ["Home & Design", "home", "armchair"],
  ["Gaming & Retro", "gaming", "gamepad-2"],
];

const img = (...n) => n.map((x) => `/img/products/${x}.jpg`);

// [title, category slug, condition, start price in dollars, images, short description]
export const ITEMS = [
  ["Aurelle Classic Black Dial Watch, 38mm", "watches", "Like new", 180, img("w1", "w2", "w3"), "Slim black-dial quartz watch with a mesh strap. Worn twice, comes with the box and papers."],
  ["Meridian Dusk Field Watch", "watches", "Good", 120, img("w2", "w1", "w4"), "Brushed steel field watch with a leather strap. Light wear on the case, keeps excellent time."],
  ["Rose Gold Heritage Chronograph", "watches", "Excellent", 320, img("w3", "w4", "w1"), "Rose-gold chronograph with a sapphire crystal. Serviced last year, full set."],
  ["Vintage Hand-Wound Dress Watch, 1970s", "watches", "Used", 90, img("w4", "w3", "w2"), "A thin hand-wound dress watch from the seventies, re-lubricated and running strong."],
  ["Steelcore Automatic Diver, 200m", "watches", "Excellent", 450, img("w5", "w6", "w7"), "Automatic diver with a unidirectional bezel and a solid steel bracelet. Pressure tested."],
  ["Noir Stainless Sport Watch", "watches", "New", 260, img("w6", "w5", "w7"), "Unworn black-dial sports watch with a screw-down crown. Still has the factory stickers."],
  ["Titan Pilot Chronograph", "watches", "Excellent", 510, img("w7", "w5", "w6"), "Large pilot chronograph in titanium. Light, strong and very comfortable on the wrist."],
  ["Pulse S7 Smartwatch 45mm", "watches", "Like new", 140, img("s1", "s2", "s3"), "Smartwatch with heart-rate and sleep tracking, two bands included. Battery health at 96%."],
  ["Orbit Smartwatch, Graphite", "watches", "Good", 95, img("s2", "s1", "s3"), "Graphite smartwatch with always-on display, tested and reset to factory settings."],
  ["Minimal Duo Smartwatch Set", "watches", "New", 60, img("s3", "s2", "s1"), "A matching pair of white smartwatches, sealed in their original packaging."],

  ["Mirrorless Body with 35mm Prime Lens", "cameras", "Excellent", 780, img("c1", "c4", "c2"), "Retro-styled mirrorless body with a fast 35mm lens. Low shutter count, no marks on the sensor."],
  ["Entry DSLR with 18-55mm Kit Lens", "cameras", "Good", 210, img("c2", "c5", "c4"), "A reliable first DSLR with a kit lens, battery, charger and strap. Great for learning."],
  ["Vintage Rangefinder Camera, Serviced", "cameras", "Used", 340, img("c3", "c6", "c1"), "Mechanical rangefinder with a bright viewfinder, cleaned and tested by a technician."],
  ["Prime Lens Trio for Mirrorless", "cameras", "Excellent", 520, img("c4", "c1", "c5"), "Three fast prime lenses in a padded case. Glass is clean, no fungus, no haze."],
  ["Pro DSLR Body, Low Shutter Count", "cameras", "Excellent", 640, img("c5", "c2", "c4"), "Full-frame DSLR with dual card slots, under 20,000 shots. Two batteries included."],
  ["Instant Film Camera Bundle", "cameras", "New", 85, img("c6", "c3", "c1"), "Instant camera with a strap and a pack of film. Unopened box."],
  ["Rose Mirrorless Camera Kit", "cameras", "Like new", 430, img("c7", "c1", "c2"), "Compact mirrorless camera in a rare rose finish, with a kit lens and a spare battery."],

  ["Studio Over-Ear Headphones, Gold", "audio", "Like new", 110, img("a1", "a2", "a3"), "Closed-back studio headphones with a detachable cable and a hard case."],
  ["Wireless ANC Headphones, Slate", "audio", "New", 150, img("a2", "a1", "a3"), "Noise-cancelling wireless headphones, 30-hour battery. Sealed box."],
  ["Desk Audio Set: Headphones and Keyboard", "audio", "Good", 75, img("a3", "a2", "t4"), "Bluetooth headphones together with a compact keyboard, perfect for a clean desk."],

  ["Flagship Smartphone 256GB, Unlocked", "tech", "Excellent", 360, img("t1", "t3", "t4"), "Unlocked flagship phone with a fresh battery and a screen protector since day one."],
  ["Ultrabook 14-inch, 16GB / 512GB", "tech", "Excellent", 520, img("t2", "t3", "t4"), "Thin aluminium ultrabook with a bright display. Fast and quiet, includes the charger."],
  ["Creator Laptop, 32GB RAM, RGB Keyboard", "tech", "Like new", 890, img("t3", "t2", "t4"), "High-end creator laptop with a colour-accurate screen and a backlit keyboard."],
  ["Low-Profile Wireless Keyboard", "tech", "New", 30, img("t4", "t2", "a3"), "Slim wireless keyboard with a three-device switch. Unused."],
  ["4K Smart TV, 55-inch", "tech", "Excellent", 330, img("g5", "t2", "g1"), "55-inch 4K television with built-in streaming apps and a voice remote."],

  ["Midnight Runner Trainers, EU 42", "sneakers", "New", 70, img("h1", "h2", "h7"), "Black performance trainers with responsive cushioning. Never worn."],
  ["Crimson Flyknit Runners, EU 43", "sneakers", "Like new", 95, img("h2", "h1", "h7"), "Bright red knit runners, tried on indoors only."],
  ["Tan Leather Court Sneakers", "sneakers", "New", 120, img("h3", "h4", "h6"), "Premium tan leather court sneakers with a gum sole."],
  ["Emerald Brogue Skate Shoes", "sneakers", "Like new", 85, img("h4", "h3", "h6"), "Hand-finished emerald brogues on a skate sole. A real conversation piece."],
  ["Pastel Court Low, Limited Colourway", "sneakers", "New", 140, img("h5", "h6", "h3"), "Limited pastel colourway, deadstock in the original box."],
  ["Cloud White Air Trainers", "sneakers", "Excellent", 100, img("h6", "h5", "h3"), "Clean white and orange trainers, lightly worn."],
  ["Volt Training Shoes", "sneakers", "New", 90, img("h7", "h1", "h2"), "Neon volt training shoes with a stable heel and a flexible forefoot."],

  ["Black Quilted Leather Chain Bag", "bags", "Excellent", 780, img("b1", "b2", "b3"), "Quilted leather crossbody with a gold-tone chain. Dust bag included."],
  ["Scarlet Structured Top-Handle Bag", "bags", "Like new", 260, img("b2", "b1", "b3"), "A structured top-handle bag in saffiano leather with a detachable strap."],
  ["Navy Commuter Backpack", "bags", "New", 55, img("b3", "b2", "f2"), "Water-resistant commuter backpack with a padded laptop sleeve."],
  ["Black Leather Biker Jacket, Size M", "bags", "Excellent", 190, img("f1", "b1", "f2"), "Classic biker jacket in soft lambskin, silk lining intact."],
  ["Classic Black Sunglasses", "bags", "New", 45, img("f2", "b3", "f1"), "Timeless black frames with UV400 lenses. Case and cloth included."],

  ["Freshwater Pearl Strand Necklace", "jewelry", "New", 210, img("j1", "j2", "j4"), "Hand-knotted freshwater pearls with a silver clasp. Presented in a gift box."],
  ["Sapphire-Tone Drop Earrings", "jewelry", "Like new", 320, img("j2", "j6", "j1"), "Statement drop earrings with blue stones and brilliant accents."],
  ["Layered Gold Chain Necklaces", "jewelry", "New", 150, img("j3", "j4", "j6"), "Two delicate layered chains in gold vermeil."],
  ["Gold Pendant Necklace", "jewelry", "Excellent", 260, img("j4", "j3", "j1"), "Solid gold pendant on a fine chain, hallmarked."],
  ["Vintage Halo Ring, Size 7", "jewelry", "Excellent", 480, img("j5", "j2", "j4"), "A vintage-style halo ring with a sparkling centre stone."],
  ["Gold Huggie Earrings, Pair", "jewelry", "New", 120, img("j6", "j3", "j2"), "Comfortable gold huggies for everyday wear."],

  ["Acoustic Dreadnought Guitar", "instruments", "Good", 240, img("m1", "m3", "m4"), "Full-bodied dreadnought with a warm tone and a fresh set of strings."],
  ["Electric Guitar, Teal Sunburst", "instruments", "Excellent", 520, img("m2", "m1", "m4"), "Single-cut electric guitar with humbuckers. Plays beautifully, sets up easily."],
  ["Parlour Acoustic, Solid Top", "instruments", "Like new", 380, img("m3", "m1", "m4"), "Compact parlour guitar with a solid spruce top, easy to play for hours."],
  ["Home Studio Starter Kit", "instruments", "Good", 300, img("m4", "m1", "m2"), "Guitars, a stand and the basics for a cosy home studio corner."],

  ["Steel Road Bike, Vintage Build, 54cm", "cycling", "Good", 410, img("k1", "k2"), "Lugged steel frame with modern components. Rides smoothly and looks fantastic."],
  ["Urban Fixed-Gear, Orange Rims", "cycling", "Excellent", 350, img("k2", "k1"), "Lightweight fixed-gear with bold orange rims, new tyres and chain."],

  ["Abstract Colour Study, Acrylic", "art", "New", 200, img("r1", "r2", "r3"), "Original acrylic study, signed and ready to hang. Certificate included."],
  ["“Ember”, Large Abstract Canvas", "art", "New", 600, img("r2", "r3", "r1"), "A large canvas full of heat and movement, 100 x 140 cm."],
  ["Fluid Art Original, 60 x 80", "art", "New", 380, img("r3", "r2", "r1"), "One-of-a-kind fluid painting sealed with a glossy resin finish."],

  ["Oak Bar Stools, Pair", "home", "Good", 60, img("d1", "d3"), "Two solid oak stools with a light patina, stable and comfortable."],
  ["Emerald Velvet 3-Seat Sofa", "home", "Like new", 540, img("d2", "d3", "d4"), "Deep emerald velvet sofa with solid legs. Smoke and pet free."],
  ["Cream Bouclé Accent Chair", "home", "New", 170, img("d3", "d2", "d1"), "Soft bouclé chair in cream, assembled and unused."],
  ["Bedroom Set with Bench Pair", "home", "Excellent", 700, img("d4", "d2", "d3"), "Complete bedroom set with two matching upholstered benches."],

  ["Console Bundle with Controller", "gaming", "Good", 180, img("g1", "g3", "g4"), "White console with a controller, cables and two games."],
  ["Retro Handheld, Yellow, Boxed", "gaming", "Excellent", 95, img("g2", "g4", "g3"), "Collector's yellow handheld in a clean shell, tested and boxed."],
  ["Wireless Controller, Aurora Edition", "gaming", "New", 40, img("g3", "g1", "g2"), "Aurora-colour wireless controller, sealed."],
  ["Retro Computing Rack Lot", "gaming", "Used", 250, img("g4", "g2", "g1"), "A glowing lot of 80s and 90s computing gear. For tinkerers and collectors."],
];

export const SELLERS = [
  ["Nora Vale", "Vale Vintage", "Lisbon"],
  ["Marcus Hale", "Hale Timepieces", "Manchester"],
  ["Priya Nair", "Lens & Light", "Bengaluru"],
  ["Tomás Rivera", "Rivera Sneakers", "Madrid"],
  ["Elena Petrova", "Petrova Atelier", "Sofia"],
  ["Daniel Kim", "Kim Audio", "Seoul"],
  ["Sofia Marin", "Marin Home", "Bucharest"],
  ["Kofi Mensah", "Mensah Collectibles", "Accra"],
  ["Hannah Lindqvist", "Lindqvist Cycles", "Gothenburg"],
  ["Omar Haddad", "Haddad Jewelers", "Amman"],
];

export const BUYERS = [
  ["Alex Morgan", "Lisbon"], ["Maya Brooks", "Austin"], ["Tom Becker", "Hamburg"], ["Lena Fischer", "Vienna"], ["Jonas Weber", "Zurich"],
  ["Chris Doyle", "Dublin"], ["Sofía Ramos", "Valencia"], ["Ravi Patel", "Leicester"], ["Emma Clark", "Toronto"], ["Liam Novak", "Prague"],
  ["Zoe Martin", "Lyon"], ["Ahmed Saleh", "Cairo"], ["Isabel Costa", "Porto"], ["Noah Lindgren", "Malmö"], ["Chloe Nguyen", "Sydney"],
  ["Mateo Silva", "São Paulo"], ["Ava Kowalski", "Gdańsk"], ["Ethan Brown", "Denver"], ["Mia Rossi", "Milan"], ["Lucas Moreau", "Brussels"],
  ["Olivia Jensen", "Aarhus"], ["Hugo Marchand", "Geneva"], ["Nina Horvat", "Zagreb"], ["Felix Bauer", "Munich"], ["Layla Hassan", "Dubai"],
  ["Oscar Dahl", "Oslo"], ["Grace Turner", "Bristol"], ["Diego Torres", "Bogotá"], ["Hana Sato", "Osaka"], ["Victor Ionescu", "Cluj"],
];
