// Tipos do banco escritos à mão (Fase 2) — o schema é o das migrations.
// Depois que o Supabase CLI estiver logado, gere o oficial e substitua este arquivo:
//   npx supabase gen types typescript --project-ref dppgyaaqnjoakdeqbnoz > src/lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CategoryKind = "fixed" | "variable" | "essential" | "non_essential";
export type TransactionType = "income" | "expense";

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: TransactionType;
          kind: CategoryKind | null;
          color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          type: TransactionType;
          kind?: CategoryKind | null;
          color?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: TransactionType;
          kind?: CategoryKind | null;
          color?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          category_id: string | null;
          type: TransactionType;
          amount_cents: number;
          description: string | null;
          occurred_on: string;
          is_recurring: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id?: string | null;
          type: TransactionType;
          amount_cents: number;
          description?: string | null;
          occurred_on: string;
          is_recurring?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string | null;
          type?: TransactionType;
          amount_cents?: number;
          description?: string | null;
          occurred_on?: string;
          is_recurring?: boolean | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          month: string;
          limit_cents: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id: string;
          month: string;
          limit_cents: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string;
          month?: string;
          limit_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_cents: number;
          saved_cents: number;
          deadline: string | null;
          status: "active" | "done" | "paused";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          target_cents: number;
          saved_cents?: number;
          deadline?: string | null;
          status?: "active" | "done" | "paused";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          target_cents?: number;
          saved_cents?: number;
          deadline?: string | null;
          status?: "active" | "done" | "paused";
          created_at?: string;
        };
        Relationships: [];
      };
      goal_contributions: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string;
          amount_cents: number;
          contributed_on: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          goal_id: string;
          amount_cents: number;
          contributed_on: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string;
          amount_cents?: number;
          contributed_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_contributions_goal_id_fkey";
            columns: ["goal_id"];
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_messages: {
        Row: {
          id: string;
          user_id: string;
          role: "user" | "assistant";
          content: string;
          created_at: string;
          analysis_month: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: "user" | "assistant";
          content: string;
          created_at?: string;
          analysis_month?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: "user" | "assistant";
          content?: string;
          created_at?: string;
          analysis_month?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      budget_status: {
        Args: { p_month: string };
        Returns: {
          category_id: string;
          category_name: string;
          color: string | null;
          limit_cents: number | null;
          spent_cents: number;
          remaining_cents: number | null;
          percent_used: number | null;
        }[];
      };
      copy_budget: {
        Args: { p_from: string; p_to: string };
        Returns: number;
      };
      goal_progress: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          target_cents: number;
          saved_cents: number;
          remaining_cents: number;
          percent: number;
          deadline: string | null;
          months_left: number | null;
          status: string;
        }[];
      };
      monthly_summary: {
        Args: { p_month: string };
        Returns: {
          total_income_cents: number;
          total_expense_cents: number;
          balance_cents: number;
        }[];
      };
      expenses_by_category: {
        Args: { p_month: string };
        Returns: {
          category_id: string | null;
          category_name: string;
          color: string | null;
          kind: string | null;
          total_cents: number;
          percent: number;
        }[];
      };
      monthly_series: {
        Args: { p_months: number };
        Returns: {
          month: string;
          income_cents: number;
          expense_cents: number;
          balance_cents: number;
        }[];
      };
      consume_ai_message: {
        Args: Record<string, never>;
        Returns: {
          allowed: boolean;
          used: number;
          daily_limit: number;
        }[];
      };
      ai_usage: {
        Args: Record<string, never>;
        Returns: {
          used: number;
          daily_limit: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
