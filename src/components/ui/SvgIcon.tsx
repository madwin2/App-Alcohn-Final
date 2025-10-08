import React from 'react';

interface SvgIconProps {
  name: string;
  className?: string;
  size?: number;
}

export function SvgIcon({ name, className = '', size = 24 }: SvgIconProps) {
  const iconPath = `/icons/${name}.svg`;
  
  return (
    <img
      src={iconPath}
      alt={name}
      className={className}
      width={size}
      height={size}
      style={{ display: 'inline-block' }}
    />
  );
}
