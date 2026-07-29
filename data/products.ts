export type Product = {
  id: number;
  name: string;
  unit: string;
  price: number;
  cost: number;
};

export const products: Product[] = [
  {
    id: 1,
    name: "Молоко 1,5 л",
    unit: "шт",
    price: 170,
    cost: 120,
  },
  {
    id: 2,
    name: "Творог 0,5 кг",
    unit: "шт",
    price: 250,
    cost: 170,
  },
  {
    id: 3,
    name: "Творог 1 кг",
    unit: "шт",
    price: 500,
    cost: 340,
  },
  {
    id: 4,
    name: "Сметана 300 мл",
    unit: "шт",
    price: 330,
    cost: 220,
  },
  {
    id: 5,
    name: "Сметана 500 мл",
    unit: "шт",
    price: 450,
    cost: 300,
  },
  {
    id: 6,
    name: "Сливки 500 мл",
    unit: "шт",
    price: 450,
    cost: 300,
  },
  {
    id: 7,
    name: "Яйцо (10 шт.)",
    unit: "десяток",
    price: 180,
    cost: 130,
  },
  {
    id: 8,
    name: "Сулугуни",
    unit: "кг",
    price: 1700,
    cost: 1200,
  },
  {
    id: 9,
    name: "Скаморца",
    unit: "кг",
    price: 1700,
    cost: 1200,
  },
  {
    id: 10,
    name: "Косичка",
    unit: "кг",
    price: 1700,
    cost: 1200,
  },
  {
    id: 11,
    name: "Качотта",
    unit: "кг",
    price: 2200,
    cost: 1500,
  },
];