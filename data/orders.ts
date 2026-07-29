export type OrderItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

export type Order = {
  id: string;
  date: string;
  customer: string;
  items: OrderItem[];
  total: number;
};