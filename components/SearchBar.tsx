type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({
  value,
  onChange,
}: SearchBarProps) {
  return (
    <div className="mb-5">
      <input
        type="text"
        placeholder="🔍 Поиск товара..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="
          w-full
          rounded-2xl
          border
          border-gray-300
          bg-white
          px-4
          py-3
          text-base
          outline-none
          shadow-sm
          transition
          focus:border-green-600
          focus:ring-2
          focus:ring-green-600
        "
      />
    </div>
  );
}