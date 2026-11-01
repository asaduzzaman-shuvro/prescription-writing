import { describe, expect, it } from "vitest";
import { patientSearchClause } from "./util";

describe("patientSearchClause", () => {
  it("returns empty for short terms", () => {
    expect(patientSearchClause("")).toEqual({ sql: "", params: [] });
    expect(patientSearchClause("a")).toEqual({ sql: "", params: [] });
  });

  it("binds one token with name/code placeholders only when not a mobile query", () => {
    const { sql, params } = patientSearchClause("test");
    expect(sql).toContain("lower(p.name) LIKE lower(?)");
    expect(sql).not.toContain("p.mobile LIKE");
    expect(params).toEqual(["%test%", "%test%", "%test%"]);
    expect(sql.match(/\?/g)?.length).toBe(params.length);
  });

  it("includes mobile clauses when the token has enough digits", () => {
    const { sql, params } = patientSearchClause("01600127050");
    expect(sql).toContain("p.mobile LIKE");
    expect(params.length).toBe(5);
  });

  it("ANDs multiple word tokens", () => {
    const { sql, params } = patientSearchClause("Mahbub Ali");
    expect(sql).toContain(" AND ");
    expect(params.length).toBe(6);
  });
});
