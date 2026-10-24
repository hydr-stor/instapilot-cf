class LocalD1 {
  constructor(sqlite) { this.sqlite=sqlite; }
  withSession() { return this; }
  prepare(sql) {
    const db=this.sqlite;
    const make=params=>({
      bind(...next) { return make(next); },
      async first(column) { const row=db.prepare(sql).get(...params); return row ? column ? row[column] : {...row} : null; },
      async all() { return {results:db.prepare(sql).all(...params).map(r=>({...r})),success:true}; },
      async run() { const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}; },
      _batch() {
        const stmt=db.prepare(sql);
        if (stmt.columns().length) return {success:true,results:stmt.all(...params).map(r=>({...r})),meta:{changes:0}};
        const r=stmt.run(...params);return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};
      }
    });
    return make([]);
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try { const result=statements.map(s=>s._batch());this.sqlite.exec('COMMIT');return result; }
    catch (e) { this.sqlite.exec('ROLLBACK');throw e; }
  }
  exec(sql) { this.sqlite.exec(sql); }
}
export { LocalD1 };
