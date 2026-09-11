export type Customer = {
  id: number;
  name: string;
  phone: string;
  address: string;
};

export const customers: Customer[] = [
  {
    id: 1,
    name: "Иван Петров",
    phone: "+7 913 123-45-67",
    address: "Томск, ул. Ленина, 15",
  },
  {
    id: 2,
    name: "Мария Иванова",
    phone: "+7 952 555-44-33",
    address: "Томск, Иркутский тракт",
  },
];