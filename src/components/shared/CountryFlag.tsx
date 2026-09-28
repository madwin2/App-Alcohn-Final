export function CountryFlag({ iso2, title }: { iso2: string; title?: string }) {
  const code = iso2.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/20x15/${code}.png`}
      srcSet={`https://flagcdn.com/40x30/${code}.png 2x`}
      width={20}
      height={15}
      alt={title ?? iso2}
      title={title ?? iso2}
      className="inline-block shrink-0 rounded-[2px] shadow-sm"
    />
  );
}
