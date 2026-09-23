"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";

import Cart from "@/components/Cart";
import OrderSummary from "@/components/OrderSummary";

type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

type Customer = {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
};

function NewOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const productFromCard = searchParams.get("product");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] =
    useState(false);

  const [search, setSearch] = useState("");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const [scannerNotice, setScannerNotice] = useState("");

  const scannerRef = useRef<Html5Qrcode | null>(null);

  const scannerStartTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const scannerSessionRef = useRef(0);

  const scannerStartingRef = useRef(false);

  const scannerSuccessHandledRef = useRef(false);

  const lastScannedBarcodeRef = useRef("");
  const lastScannedAtRef = useRef(0);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);

        if (productFromCard) {
          const product = data.find(
            (p: any) => p.id === Number(productFromCard)
          );

          if (product && product.stock > 0) {
            setCart([
              {
                id: product.id,
                name: product.name,
                price: product.price,
                quantity: 1,
              },
            ]);
          }
        }
      });
  }, [productFromCard]);

  useEffect(() => {
    fetch("/api/customers")
      .then((res) => res.json())
      .then((data) => setCustomers(data));
  }, []);

  const selectedCustomer = useMemo(() => {
    if (!customerId) {
      return null;
    }

    return (
      customers.find(
        (customer) => customer.id === Number(customerId)
      ) ?? null
    );
  }, [customers, customerId]);

  const filteredCustomers = useMemo(() => {
    const value = customerSearch.toLowerCase().trim();

    if (!value) {
      return customers;
    }

    return customers.filter((customer) => {
      const name = customer.name.toLowerCase();

      const phone = (customer.phone ?? "").toLowerCase();

      return (
        name.includes(value) ||
        phone.includes(value)
      );
    });
  }, [customers, customerSearch]);

  const filteredProducts = useMemo(() => {
    const value = search.toLowerCase().trim();

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(value) ||
        (product.barcode &&
          product.barcode
            .toLowerCase()
            .includes(value))
    );
  }, [products, search]);

  function selectCustomer(customer: Customer) {
    setCustomerId(String(customer.id));
    setCustomerSearch("");
    setCustomerSearchOpen(false);
  }

  function clearCustomer() {
    setCustomerId("");
    setCustomerSearch("");
    setCustomerSearchOpen(false);
  }

  function addProduct(id: number): boolean {
    const product = products.find(
      (p) => p.id === id
    );

    if (!product) {
      return false;
    }

    const cartItem = cart.find(
      (item) => item.id === id
    );

    const currentQuantity = cartItem
      ? cartItem.quantity
      : 0;

    const realStock = product.batches
      ? product.batches.reduce(
          (sum: number, batch: any) =>
            sum + batch.quantity,
          0
        )
      : product.stock;

    if (realStock <= 0) {
      alert("❌ Товара нет в наличии");

      return false;
    }

    if (currentQuantity >= realStock) {
      alert(
        `❌ На складе только ${realStock} ${product.unit}`
      );

      return false;
    }

    setCart((current) => {
      const existing = current.find(
        (item) => item.id === id
      );

      if (existing) {
        return current.map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
        },
      ];
    });

    return true;
  }

  function removeProduct(id: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: item.quantity - 1,
              }
            : item
        )
        .filter(
          (item) => item.quantity > 0
        )
    );
  }

  async function cleanupScanner(
    scanner: Html5Qrcode | null
  ) {
    if (!scanner) {
      return;
    }

    try {
      await scanner.stop();
    } catch {
      // Камера могла уже остановиться.
    }

    try {
      await scanner.clear();
    } catch {
      // Сканер мог уже быть очищен.
    }
  }

  async function stopScanner() {
    scannerSessionRef.current += 1;

    if (
      scannerStartTimeoutRef.current !== null
    ) {
      clearTimeout(
        scannerStartTimeoutRef.current
      );

      scannerStartTimeoutRef.current = null;
    }

    scannerStartingRef.current = false;

    const currentScanner =
      scannerRef.current;

    scannerRef.current = null;

    setScannerOpen(false);

    if (!currentScanner) {
      return;
    }

    await cleanupScanner(currentScanner);
  }

  function handleDecodedBarcode(
    decodedText: string
  ) {
    const barcode = decodedText.trim();

    if (!barcode) {
      return;
    }

    if (scannerSuccessHandledRef.current) {
      return;
    }

    const now = Date.now();

    const isSameBarcodeTooSoon =
      lastScannedBarcodeRef.current ===
        barcode &&
      now -
        lastScannedAtRef.current <
        1200;

    if (isSameBarcodeTooSoon) {
      return;
    }

    lastScannedBarcodeRef.current =
      barcode;

    lastScannedAtRef.current = now;

    const product = products.find(
      (p) =>
        String(p.barcode ?? "").trim() ===
        barcode
    );

    if (!product) {
      setScannerMessage(
        `❌ Товар с кодом ${barcode} не найден`
      );

      setScannerNotice(
        `Штрихкод ${barcode} не зарегистрирован среди товаров.`
      );

      return;
    }

    const added = addProduct(product.id);

    if (!added) {
      setScannerMessage(
        `❌ ${product.name}: товар нельзя добавить`
      );

      return;
    }

    scannerSuccessHandledRef.current = true;

    setScannerNotice(
      `✅ ${product.name} добавлен в корзину`
    );

    setScannerMessage(
      "Товар добавлен. Сканер закрывается..."
    );

    void stopScanner();
  }

  async function initializeScanner(
    session: number
  ) {
    if (
      session !== scannerSessionRef.current
    ) {
      return;
    }

    const scanConfig = {
      fps: 10,

      qrbox: (
        viewfinderWidth: number,
        viewfinderHeight: number
      ) => {
        const size = Math.min(
          Math.floor(
            viewfinderWidth * 0.84
          ),
          Math.floor(
            viewfinderHeight * 0.65
          ),
          360
        );

        return {
          width: Math.max(180, size),
          height: Math.max(180, size),
        };
      },

      aspectRatio: 1.7777778,

      disableFlip: false,

      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
      ],
    };

    let scanner =
      new Html5Qrcode("reader", {
        verbose: false,
      });

    scannerRef.current = scanner;

    try {
      setScannerMessage(
        "Камера запускается..."
      );

      await scanner.start(
        {
          facingMode: "environment",
        },
        scanConfig,
        (decodedText) => {
          handleDecodedBarcode(
            decodedText
          );
        },
        () => {}
      );

      if (
        session !== scannerSessionRef.current
      ) {
        await cleanupScanner(scanner);

        if (
          scannerRef.current === scanner
        ) {
          scannerRef.current = null;
        }

        return;
      }

      scannerStartingRef.current = false;

      setScannerMessage(
        "Наведите заднюю камеру на QR-код или штрихкод. Держите код внутри рамки."
      );

      return;
    } catch {
      await cleanupScanner(scanner);

      if (
        scannerRef.current === scanner
      ) {
        scannerRef.current = null;
      }
    }

    if (
      session !== scannerSessionRef.current
    ) {
      return;
    }

    try {
      setScannerMessage(
        "Выбираем заднюю камеру..."
      );

      const cameras =
        await Html5Qrcode.getCameras();

      if (cameras.length === 0) {
        throw new Error(
          "Камеры не найдены"
        );
      }

      const rearCamera =
        cameras.find((camera) =>
          /back|rear|environment|зад|основ/i.test(
            camera.label
          )
        );

      const camera =
        rearCamera ??
        cameras[cameras.length - 1];

      scanner =
        new Html5Qrcode("reader", {
          verbose: false,
        });

      scannerRef.current = scanner;

      await scanner.start(
        camera.id,
        scanConfig,
        (decodedText) => {
          handleDecodedBarcode(
            decodedText
          );
        },
        () => {}
      );

      if (
        session !== scannerSessionRef.current
      ) {
        await cleanupScanner(scanner);

        if (
          scannerRef.current === scanner
        ) {
          scannerRef.current = null;
        }

        return;
      }

      scannerStartingRef.current = false;

      setScannerMessage(
        "Наведите заднюю камеру на QR-код или штрихкод. Держите код внутри рамки."
      );
    } catch {
      scannerStartingRef.current = false;

      await cleanupScanner(scanner);

      if (
        scannerRef.current === scanner
      ) {
        scannerRef.current = null;
      }

      if (
        session !== scannerSessionRef.current
      ) {
        return;
      }

      setScannerOpen(false);

      setScannerMessage(
        "Не удалось открыть камеру."
      );

      setScannerNotice(
        "Проверьте разрешение камеры для Chrome и попробуйте снова."
      );
    }
  }

  function startScanner() {
    if (
      scannerRef.current ||
      scannerStartingRef.current
    ) {
      return;
    }

    const session =
      scannerSessionRef.current + 1;

    scannerSessionRef.current =
      session;

    scannerStartingRef.current = true;

    scannerSuccessHandledRef.current =
      false;

    lastScannedBarcodeRef.current = "";
    lastScannedAtRef.current = 0;

    setScannerOpen(true);

    setScannerNotice("");

    setScannerMessage(
      "Камера запускается..."
    );

    scannerStartTimeoutRef.current =
      setTimeout(() => {
        scannerStartTimeoutRef.current =
          null;

        void initializeScanner(
          session
        );
      }, 150);
  }

  useEffect(() => {
    return () => {
      scannerSessionRef.current += 1;

      if (
        scannerStartTimeoutRef.current !==
        null
      ) {
        clearTimeout(
          scannerStartTimeoutRef.current
        );

        scannerStartTimeoutRef.current =
          null;
      }

      const currentScanner =
        scannerRef.current;

      scannerRef.current = null;

      if (currentScanner) {
        void cleanupScanner(
          currentScanner
        );
      }
    };
  }, []);

  const total = cart.reduce(
    (sum, item) =>
      sum +
      item.price *
        item.quantity,
    0
  );

  async function saveOrder() {
    if (cart.length === 0) {
      alert("Корзина пустая");

      return;
    }

    const res = await fetch(
      "/api/orders",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          items: cart,
          total,

          customerId: customerId
            ? Number(customerId)
            : null,
        }),
      }
    );

    if (!res.ok) {
      alert(
        "Ошибка сохранения заказа"
      );

      return;
    }

    alert("✅ Заказ оформлен");

    setCart([]);
    setCustomerId("");
    setCustomerSearch("");

    router.push("/orders");
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold text-green-700">
          🛒 Новый заказ
        </h1>

        {selectedCustomer ? (
          <div className="mb-4 rounded-xl bg-white p-4 shadow">
            <div className="mb-3 text-sm font-semibold text-gray-500">
              👤 Клиент
            </div>

            <div className="text-lg font-bold text-gray-900">
              {selectedCustomer.name}
            </div>

            {selectedCustomer.phone && (
              <div className="mt-1 text-gray-600">
                📞 {selectedCustomer.phone}
              </div>
            )}

            {selectedCustomer.address && (
              <div className="mt-1 text-gray-600">
                📍 {selectedCustomer.address}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setCustomerId("");
                setCustomerSearch("");
                setCustomerSearchOpen(true);
              }}
              className="
                mt-4
                w-full
                rounded-xl
                border
                border-gray-300
                bg-white
                py-3
                font-semibold
                text-gray-700
              "
            >
              Изменить клиента
            </button>
          </div>
        ) : (
          <div className="relative mb-4">
            <div className="flex gap-2">
              <input
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(
                    e.target.value
                  );

                  setCustomerSearchOpen(
                    true
                  );
                }}
                onFocus={() =>
                  setCustomerSearchOpen(
                    true
                  )
                }
                placeholder="👤 Имя или телефон клиента"
                className="
                  w-full
                  rounded-xl
                  border
                  bg-white
                  p-3
                  outline-none
                "
              />

              <button
                type="button"
                onClick={clearCustomer}
                className="
                  shrink-0
                  rounded-xl
                  bg-gray-200
                  px-3
                  font-semibold
                  text-gray-700
                "
              >
                Без
              </button>
            </div>

            {customerSearchOpen && (
              <div
                className="
                  absolute
                  left-0
                  right-0
                  z-20
                  mt-2
                  max-h-64
                  overflow-y-auto
                  rounded-xl
                  bg-white
                  shadow-lg
                "
              >
                {filteredCustomers.length ===
                0 ? (
                  <div className="p-4 text-gray-500">
                    Клиенты не найдены
                  </div>
                ) : (
                  filteredCustomers.map(
                    (customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() =>
                          selectCustomer(
                            customer
                          )
                        }
                        className="
                          w-full
                          border-b
                          px-4
                          py-3
                          text-left
                          last:border-b-0
                          hover:bg-gray-50
                        "
                      >
                        <div className="font-semibold text-gray-900">
                          {customer.name}
                        </div>

                        {customer.phone && (
                          <div className="text-sm text-gray-500">
                            📞 {customer.phone}
                          </div>
                        )}

                        {customer.address && (
                          <div className="text-sm text-gray-500">
                            📍 {customer.address}
                          </div>
                        )}
                      </button>
                    )
                  )
                )}

                <button
                  type="button"
                  onClick={clearCustomer}
                  className="
                    w-full
                    border-t
                    px-4
                    py-3
                    text-left
                    font-semibold
                    text-gray-600
                  "
                >
                  Без клиента
                </button>
              </div>
            )}
          </div>
        )}

        <input
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          placeholder="🔍 Название или штрихкод"
          className="
            mb-4
            w-full
            rounded-xl
            border
            bg-white
            p-3
          "
        />

        {!scannerOpen && (
          <button
            type="button"
            onClick={startScanner}
            className="
              mb-4
              w-full
              rounded-xl
              bg-blue-600
              py-3
              font-bold
              text-white
              transition
              hover:bg-blue-700
              active:scale-[0.99]
            "
          >
            📷 Сканировать штрихкод
          </button>
        )}

        {scannerNotice && (
          <div
            className="
              mb-4
              rounded-xl
              border
              border-blue-200
              bg-blue-50
              p-3
              text-center
              text-sm
              font-semibold
              text-blue-800
            "
          >
            {scannerNotice}
          </div>
        )}

        {scannerOpen && (
          <div className="mb-4 rounded-2xl bg-white p-3 shadow">
            <div className="mb-3">
              <div className="text-center text-lg font-bold text-gray-900">
                📷 Сканирование
              </div>

              <div className="mt-1 text-center text-sm text-gray-600">
                Наведите заднюю камеру на QR-код или штрихкод
              </div>
            </div>

            <div
              id="reader"
              className="
                w-full
                overflow-hidden
                rounded-2xl
                bg-black
              "
            />

            <div
              className="
                mt-3
                rounded-xl
                bg-slate-50
                p-3
                text-center
                text-sm
                text-gray-700
              "
            >
              {scannerMessage}
            </div>

            <button
              type="button"
              onClick={() => {
                void stopScanner();
              }}
              className="
                mt-3
                w-full
                rounded-xl
                bg-red-600
                py-3
                font-bold
                text-white
                transition
                hover:bg-red-700
              "
            >
              ❌ Закрыть сканер
            </button>
          </div>
        )}

        <div className="space-y-3">
          {filteredProducts.map(
            (product) => {
              const isOutOfStock =
                product.stock <= 0;

              return (
                <div
                  key={product.id}
                  className={`
                    flex
                    items-center
                    justify-between
                    rounded-xl
                    bg-white
                    p-4
                    shadow
                    ${
                      isOutOfStock
                        ? "opacity-60"
                        : ""
                    }
                  `}
                >
                  <div>
                    <div
                      className={`font-semibold ${
                        isOutOfStock
                          ? "text-gray-500"
                          : ""
                      }`}
                    >
                      {product.name}
                    </div>

                    <div className="text-gray-500">
                      {product.price} ₽
                    </div>

                    {isOutOfStock ? (
                      <div className="text-sm font-semibold text-red-600">
                        Нет в наличии
                      </div>
                    ) : (
                      <div
                        className={
                          product.stock <= 5
                            ? "text-sm text-red-600"
                            : "text-sm text-gray-500"
                        }
                      >
                        Остаток: {product.stock}{" "}
                        {product.unit}
                      </div>
                    )}
                  </div>

                  {isOutOfStock ? (
                    <button
                      type="button"
                      disabled
                      className="
                        cursor-not-allowed
                        rounded-xl
                        bg-gray-300
                        px-4
                        py-2
                        font-semibold
                        text-gray-500
                      "
                    >
                      Нет
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        addProduct(product.id)
                      }
                      className="
                        rounded-xl
                        bg-green-700
                        px-4
                        py-2
                        text-white
                        transition
                        hover:bg-green-800
                      "
                    >
                      Добавить
                    </button>
                  )}
                </div>
              );
            }
          )}
        </div>

        <div className="mt-8 space-y-5">
          <Cart
            items={cart}
            onAdd={addProduct}
            onRemove={removeProduct}
          />

          <OrderSummary
            total={total}
            onSave={saveOrder}
          />
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-5">
          Загрузка...
        </div>
      }
    >
      <NewOrderPage />
    </Suspense>
  );
}