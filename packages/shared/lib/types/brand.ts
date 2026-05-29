// Generic branding utility for nominal types.
//
// TypeScript is structurally typed — two `string` types are interchangeable.
// Branding adds a phantom property to defeat this. At runtime, branded values
// are plain strings (or whatever the base type is). The brand exists only at
// compile time.
//
// Usage:
//
//   type UserId = Branded<string, 'UserId'>;
//   type OrderId = Branded<string, 'OrderId'>;
//
//   const u: UserId = 'abc' as UserId;
//   const o: OrderId = u;  // Error — different brands
//
// Brands compose via intersection. A "resolved" ref is a subtype of ref:
//
//   type DefinitionRef = Branded<string, 'DefinitionRef'>;
//   type DefinitionKey = DefinitionRef & Brand<'Resolved'>;
//
//   const key: DefinitionKey = ...;
//   const ref: DefinitionRef = key;  // OK — Key extends Ref
//   const key2: DefinitionKey = ref; // Error — Ref is not Key
//
// Uses a unique symbol key so brands never collide with real properties.

declare const TYPE_BRAND: unique symbol;

export type Brand<B extends string> = {
  readonly [TYPE_BRAND]: {
    readonly [K in B]: true;
  };
};

export type Branded<T, B extends string> = T & Brand<B>;
