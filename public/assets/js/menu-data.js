/* MR. Sandwich menu (Gachibowli), typed from the printed menu.
   Edit prices and items here. The /menu page and the homepage food list both read this file.
   Item shape: { name, price }            single price
               { name, prices: [a, b] }   two prices (columns named in the group's `cols`)
               { name, price, desc }      optional description
               featured: true             also shown on the homepage */
window.MENU = {
  notes: [
    'Items are subject to availability.',
    'GST extra as applicable.',
    'Please tell our team about any food allergies before ordering.',
    'Prices and offers may change without notice.'
  ],
  // Monthly meal plans, prepaid: one meal = any Top Combo priced at mealValue (the combos section below).
  // Valid `days` from the day of purchase; unused meals expire. Meals left show on /pass; the owner adds
  // plans and ticks off meals on /admin (admin.js MEALS mirrors these numbers).
  mealPlans: {
    mealValue: 300,
    days: 30,
    plans: [
      { meals: 5, price: 1350 },
      { meals: 8, price: 2040 },
      { meals: 10, price: 2400 }
    ]
  },
  sections: [
    {
      id: 'combos', title: 'Top Combos', groups: [{ items: [
        { name: 'Simply Burger (veggie patty) + Simply Salted Fries + Vanilla Shake', price: 250 },
        { name: 'Cheesy Burger + Veg Sandwich + Mint Mojito', price: 250 },
        { name: 'Veg Sandwich + Peri Peri Fries + Mint Mojito', price: 300 },
        { name: 'Aloo Tikki Wrap + Peri Peri Fries + Green Apple Mocktail', price: 300 },
        { name: 'Veg Pizza + Veg Momos + Hot Coffee', price: 300 },
        { name: 'Mr. Veggie Sub + Salted Fries + Cold Coffee', price: 300, featured: true, short: 'Sub combo', desc: 'A full veggie sub, salted fries and a cold coffee.' },
        { name: 'Margherita Pizza + Salted Fries + Mango Mastani', price: 350 }
      ] }]
    },
    {
      id: 'subs', title: 'Subs', groups: [{ items: [
        { name: 'Mr. Aloo Tikki Sub', price: 129, desc: 'Aloo tikki, green chutney, tangy sauce, capsicum, tomato, onion, multigrain bread' },
        { name: 'Mr. Bombay Sub', price: 129, desc: 'Veggie patty, green chutney, imli chutney, capsicum, tomato, onion, multigrain bread' },
        { name: 'Mr. Paneer Sub', price: 129, desc: 'Paneer tikki, green chutney, tangy sauce, capsicum, tomato, onion, multigrain bread' },
        { name: 'Mr. Veggie Sub', price: 129, desc: 'Capsicum, tomato, onion, olives, jalapenos, green chutney, tangy sauce, multigrain bread' },
        { name: 'Aloo Tikki Cheese Sub', price: 199, desc: 'Aloo tikki, extra cheese, olive, pizza sauce, capsicum, tomato, onion, multigrain bread' },
        { name: 'Paneer Cheese Sub', price: 239, desc: 'Spiced paneer, extra cheese, green chutney, capsicum, tomato, onion, multigrain bread' },
        { name: 'Mushroom Cheese Sub', price: 249, desc: 'Mushroom, extra cheese, green chutney, capsicum, tomato, onion, multigrain bread' },
        { name: 'Mr. Pizza Paneer Sub', price: 279, featured: true, desc: 'Grilled paneer, extra cheese, olive, pizza sauce, capsicum, tomato, onion, multigrain bread' }
      ] }]
    },
    {
      id: 'pizza', title: 'Pizza', note: '+ ₹20 extra topping', groups: [{ items: [
        { name: 'Veg Pizza', price: 159 },
        { name: 'Jalapenos Pizza', price: 179 },
        { name: 'Mushroom Pizza', price: 179 },
        { name: 'Olive Pizza', price: 179 },
        { name: 'Sweetcorn Pizza', price: 179 },
        { name: 'Mix Veg Pizza', price: 189 },
        { name: 'Tandoori Pizza', price: 189 },
        { name: 'Tandoori Cheese Pizza', price: 199 },
        { name: 'Veg Cheese Pizza', price: 199 },
        { name: 'Margherita Pizza', price: 219 },
        { name: 'Paneer Pizza', price: 249, featured: true, desc: 'Loaded with paneer and cheese. Easy to share.' },
        { name: 'Tandoori Cheese Corn Pizza', price: 339 }
      ] }]
    },
    {
      id: 'burgers', title: 'Burgers', note: '+ ₹20 extra cheese', groups: [{ cols: ['Aloo patty', 'Veg patty'], items: [
        { name: 'Simply Burger', prices: [100, 115] },
        { name: 'Tandoori Burger', prices: [110, 115] },
        { name: 'Cheese Burger', prices: [110, 115] },
        { name: 'Classic Burger', prices: [130, 150] },
        { name: 'Paneer Burger', prices: [130, 140] },
        { name: 'Tandoori Cheese Burger', prices: [130, 140] },
        { name: 'Chilli Cheese Burger', prices: [135, 145] },
        { name: 'Classic Cheese Burger', prices: [140, 155] },
        { name: 'Paneer Cheese Burger', prices: [140, 150] },
        { name: 'Double Trouble Burger', prices: [170, 185], featured: true, desc: 'Our loaded burger. Aloo or veg patty.' }
      ] }]
    },
    {
      id: 'sandwich', title: 'Sandwich', groups: [{ cols: ['Club', 'Grilled'], items: [
        { name: 'Veg Sandwich', prices: [75, 90] },
        { name: 'Peri Peri Paneer Sandwich', prices: [125, 140] },
        { name: 'Tandoori Paneer Sandwich', prices: [135, 150] },
        { name: 'Chocolate Nutella Sandwich', prices: [170, 185] },
        { name: 'Overloaded Veg Sandwich', prices: [185, 200] }
      ] }]
    },
    {
      id: 'pasta-momo', title: 'Pasta & Momo', groups: [
        { title: 'Pasta', items: [
          { name: 'Red Sauce Pasta', price: 199 },
          { name: 'White Sauce Pasta', price: 199 }
        ] },
        { title: 'Momo', note: '6 pcs · fried', items: [
          { name: 'Simply Veg Momo', price: 99 },
          { name: 'Paneer Tikka Momo', price: 109 },
          { name: 'Peri Peri Momo', price: 109 }
        ] }
      ]
    },
    {
      id: 'wraps', title: 'Wraps & Greens', groups: [
        { title: 'Wraps', items: [
          { name: 'Aloo Tikki Wrap', price: 99 },
          { name: 'Peri Peri Wrap', price: 110 },
          { name: 'Salad Wrap', price: 120 },
          { name: 'Paneer Wrap', price: 129 },
          { name: 'Tandoori Paneer Wrap', price: 159 }
        ] },
        { title: 'Salad', items: [
          { name: 'Sprout Salad', price: 179 },
          { name: 'Baked Beans Salad', price: 179 },
          { name: 'Paneer Tikka Salad', price: 199 }
        ] }
      ]
    },
    {
      id: 'munchies', title: 'Munchies', groups: [
        { title: 'Fries', items: [
          { name: 'Simply Salted Fries', price: 79 },
          { name: 'Peri Peri Fries', price: 120 },
          { name: 'Cheesy Fries', price: 129 },
          { name: 'Creamy Fries', price: 129 },
          { name: 'Loaded Fries', price: 159, featured: true, desc: 'Fries with all the toppings.' }
        ] },
        { title: 'Garlic Bread', items: [
          { name: 'Cheese Garlic Bread', price: 99 },
          { name: 'Cheese Veggie Garlic Bread', price: 100 }
        ] },
        { title: 'Nachos', items: [
          { name: 'Cheesy Nachos', price: 179 },
          { name: 'Jalapeno & Olive Nachos', price: 189 },
          { name: 'Veg Loaded Nachos', price: 209 }
        ] }
      ]
    },
    {
      id: 'nuggets', title: 'Shots & Nuggets', note: '8 pcs · crispy, cheesy, hard to resist', groups: [{ items: [
        { name: 'Chilli Potato Garlic Shots', price: 119 },
        { name: 'Chipotle Potato Garlic Shots', price: 139 },
        { name: 'Peri Peri Potato Garlic Shots', price: 139 },
        { name: 'Tandoori Potato Garlic Shots', price: 139 },
        { name: 'Cheese Corn Nuggets', price: 159 },
        { name: 'Chipotle Cheese Corn Nuggets', price: 169 },
        { name: 'Peri Peri Cheese Corn Nuggets', price: 169, featured: true, desc: '8 crispy cheese corn nuggets with a peri peri kick.' },
        { name: 'Tandoori Cheese Corn Nuggets', price: 169 }
      ] }]
    },
    {
      id: 'boba', title: 'Boba Drinks', groups: [
        { title: 'Boba Smoothies', items: [
          { name: 'Strawberry Boba Smoothie', price: 129 },
          { name: 'Pina Colada Smoothie', price: 129 },
          { name: 'Green Apple Boba Smoothie', price: 139 },
          { name: 'Banana Boba Smoothie', price: 139 },
          { name: 'Mango Boba Smoothie', price: 159, featured: true, desc: 'Mango smoothie with boba pearls.' },
          { name: 'Banana & Strawberry Smoothie', price: 179 }
        ] },
        { title: 'Boba Mocktails', items: [
          { name: 'Boba Mint Mojito', price: 109 },
          { name: 'Boba Watermelon', price: 119 },
          { name: 'Boba Strawberry', price: 129 },
          { name: 'Boba Green Apple', price: 129 }
        ] },
        { title: 'Boba Milkshakes', items: [
          { name: 'Strawberry Boba Milkshake', price: 119 },
          { name: 'Chocolate Boba Milkshake', price: 129 },
          { name: 'Mango Boba Milkshake', price: 129 },
          { name: 'Black Currant Boba Milkshake', price: 139 }
        ] }
      ]
    },
    {
      id: 'mastani', title: 'Mastani Specials', note: 'A sip of pure indulgence', groups: [{ items: [
        { name: 'Mango Mastani', price: 119 },
        { name: 'Strawberry Mastani', price: 119 },
        { name: 'Butterscotch Mastani', price: 129 },
        { name: 'Chocolate Mastani', price: 129 },
        { name: 'Pista Mastani', price: 129 },
        { name: 'Anjeer Mastani', price: 139 },
        { name: 'Sitaphal (Custard Apple) Mastani', price: 139 },
        { name: 'Dry Fruit Mastani', price: 169 }
      ] }]
    },
    {
      id: 'mocktails', title: 'Mocktails', groups: [{ items: [
        { name: 'Black Currant', price: 89 },
        { name: 'Fresh Lemon (Water)', price: 89 },
        { name: 'Guava', price: 89 },
        { name: 'Mango', price: 89 },
        { name: 'Mint Mojito', price: 89 },
        { name: 'Blue Lagoon', price: 99 },
        { name: 'Fresh Lemon (Soda)', price: 99 },
        { name: 'Spicy Kiwi', price: 99 },
        { name: 'Green Apple', price: 109 },
        { name: 'Strawberry', price: 109 }
      ] }]
    },
    {
      id: 'shakes', title: 'Shake & Chill', groups: [{ items: [
        { name: 'Strawberry Shake', price: 89 },
        { name: 'Vanilla Shake', price: 89 },
        { name: 'Butterscotch Shake', price: 99 },
        { name: 'Chocolate Shake', price: 99 },
        { name: 'Pista Shake', price: 99 },
        { name: 'Guava Shake', price: 109 },
        { name: 'Kesar Pista Shake', price: 109 },
        { name: 'Mango Shake', price: 109 },
        { name: 'Black Currant Shake', price: 129 },
        { name: 'Gulkand Shake', price: 129 },
        { name: 'Kitkat Shake', price: 129 },
        { name: 'Oreo Shake', price: 129, featured: true, desc: 'Thick, chilled Oreo milkshake.' },
        { name: 'Dry Fruit Shake', price: 149 }
      ] }]
    },
    {
      id: 'protein', title: 'Protein Picks', groups: [{ items: [
        { name: 'Chocolate Shake', price: 109 },
        { name: 'Banana Shake', price: 139 },
        { name: 'Brownie Blast', price: 159 },
        { name: 'Peanut Butter Shake', price: 159 }
      ] }]
    },
    {
      id: 'sweet', title: 'Sweet Treats', groups: [
        { title: 'Waffles', items: [
          { name: 'Classical Caramel Waffle', price: 159 },
          { name: 'Banana Caramel Waffle', price: 179 },
          { name: 'Creamy Nutella Waffle', price: 179 },
          { name: 'Fruit Blast Waffle', price: 179 },
          { name: 'Kitkat Crunch Waffle', price: 179 },
          { name: 'Nutella Brownie Waffle', price: 179 }
        ] },
        { title: 'Brownies', items: [
          { name: 'Brownie Special', price: 99 },
          { name: 'Brownie with Ice Cream', price: 129 },
          { name: 'Sizzling Brownie with Ice Cream', price: 179 }
        ] },
        { title: 'Ice Cream', note: 'per scoop', items: [
          { name: 'Butterscotch, Choco Chips, Chocolate, Gulkand, Kesar Pista, Mango, Pista, Strawberry or Vanilla', price: 79 },
          { name: 'Dry Fruit', price: 100 }
        ] }
      ]
    },
    {
      id: 'coffee', title: 'Cold Coffee & Tea', groups: [
        { title: 'Cold Coffee Classics', items: [
          { name: 'Crunch Plain', price: 110 },
          { name: 'Milky Crunch', price: 110 },
          { name: 'Special Crunch', price: 130 },
          { name: 'Crunch with Ice Cream', price: 150 }
        ] },
        { title: 'Tea & Coffee', items: [
          { name: 'Normal Tea', price: 49 },
          { name: 'Black Coffee', price: 49 },
          { name: 'Masala Tea', price: 59 },
          { name: 'Regular Coffee', price: 59 }
        ] }
      ]
    }
  ]
};
