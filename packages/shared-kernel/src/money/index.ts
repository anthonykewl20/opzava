import { DomainError, err, ok, type Result } from "../result/index.js";

export type CurrencyCode = Uppercase<string> & { readonly __currencyCode: "CurrencyCode" };

export interface MoneyInput {
  readonly amountMinor: number;
  readonly currency: string;
}

const currencyPattern = /^[A-Z]{3}$/;

function makeCurrencyCode(value: string): CurrencyCode {
  const normalized = value.trim().toUpperCase();

  if (!currencyPattern.test(normalized)) {
    throw new DomainError({
      code: "sharedKernel.invalidCurrency",
      message: "Currency must be an ISO 4217 three-letter code.",
      details: { currency: value }
    });
  }

  return normalized as CurrencyCode;
}

export class Money {
  public readonly amountMinor: number;
  public readonly currency: CurrencyCode;

  private constructor(input: { readonly amountMinor: number; readonly currency: CurrencyCode }) {
    this.amountMinor = input.amountMinor;
    this.currency = input.currency;
  }

  public static create(input: MoneyInput): Money {
    if (!Number.isSafeInteger(input.amountMinor)) {
      throw new DomainError({
        code: "sharedKernel.invalidMoneyAmount",
        message: "Money amountMinor must be a safe integer.",
        details: { amountMinor: input.amountMinor }
      });
    }

    return new Money({
      amountMinor: input.amountMinor,
      currency: makeCurrencyCode(input.currency)
    });
  }

  public static parse(input: unknown): Result<Money> {
    if (
      typeof input !== "object" ||
      input === null ||
      !("amountMinor" in input) ||
      !("currency" in input)
    ) {
      return err(
        new DomainError({
          code: "sharedKernel.invalidMoneyInput",
          message: "Money must be an object with amountMinor and currency."
        })
      );
    }

    const candidate = input as Partial<Record<keyof MoneyInput, unknown>>;

    if (typeof candidate.amountMinor !== "number" || typeof candidate.currency !== "string") {
      return err(
        new DomainError({
          code: "sharedKernel.invalidMoneyInput",
          message: "Money amountMinor must be a number and currency must be a string."
        })
      );
    }

    if (candidate.amountMinor < 0) {
      return err(
        new DomainError({
          code: "sharedKernel.invalidMoneyAmount",
          message: "Money amountMinor must be non-negative.",
          details: { amountMinor: candidate.amountMinor }
        })
      );
    }

    try {
      return ok(Money.create(candidate as MoneyInput));
    } catch (error) {
      if (error instanceof DomainError) {
        return err(error);
      }

      throw error;
    }
  }

  public static zero(currency: string): Money {
    return Money.create({ amountMinor: 0, currency });
  }

  public add(other: Money): Money {
    this.assertSameCurrency(other);

    return Money.create({
      amountMinor: this.amountMinor + other.amountMinor,
      currency: this.currency
    });
  }

  public subtract(other: Money): Money {
    this.assertSameCurrency(other);

    return Money.create({
      amountMinor: this.amountMinor - other.amountMinor,
      currency: this.currency
    });
  }

  public equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }

  public toJSON(): MoneyInput {
    return {
      amountMinor: this.amountMinor,
      currency: this.currency
    };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new DomainError({
        code: "sharedKernel.currencyMismatch",
        message: "Money values with different currencies cannot be combined.",
        details: { left: this.currency, right: other.currency }
      });
    }
  }
}
