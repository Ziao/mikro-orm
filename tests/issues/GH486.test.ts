import { Entity, PrimaryKey, Property, OneToMany, MikroORM, ReflectMetadataProvider, Collection, ManyToOne } from '../../lib';
import { PostgreSqlDriver } from '../../lib/drivers/PostgreSqlDriver';

@Entity()
class A {

  @PrimaryKey()
  id!: number;

  @OneToMany(() => B, b => b.a)
  bs = new Collection<B>(this);

  @Property()
  prop: string = 'foo';

}

@Entity()
class B {

  @PrimaryKey()
  id!: number;

  @ManyToOne(() => A)
  a!: A;

}

describe('GH issue 486', () => {

  let orm: MikroORM<PostgreSqlDriver>;

  beforeAll(async () => {
    orm = await MikroORM.init({
      entities: [A, B],
      dbName: `mikro_orm_test_gh_486`,
      type: 'postgresql',
      metadataProvider: ReflectMetadataProvider,
      cache: { enabled: false },
    });
    await orm.getSchemaGenerator().ensureDatabase();
    await orm.getSchemaGenerator().dropSchema();
    await orm.getSchemaGenerator().createSchema();
  });

  afterAll(async () => await orm.close(true));

  test(`GH issue 486`, async () => {
    const fixture = new A();
    fixture.bs.add(new B());
    await orm.em.persistAndFlush(fixture);
    orm.em.clear();

    // Fetch A from the DB without relations and update it
    const update1 = await orm.em.findOneOrFail(A, fixture.id);
    update1.prop = 'bar';

    // Later in the tx (before we flush) a conditional branch needs to update relations
    // so we fetch it from the IdentityMap but the relation isn't initialized (both assertions pass)
    const update2 = await orm.em.findOneOrFail(A, fixture.id);
    expect(update2).toBe(update1);
    expect(update2.prop).toBe('bar');

    expect(update2.bs.isInitialized()).toBe(false);
    await update2.bs.init();
    expect(update2.prop).toBe('bar');

    // Make the update and finish the transaction
    update2.bs.add(new B());
    await orm.em.flush();

    // Clear the context and fetch the real DB state
    orm.em.clear();
    const dbState = await orm.em.findOneOrFail(A, fixture.id, ['bs']);
    expect(dbState.bs).toHaveLength(2);
    expect(dbState.prop).toBe('bar');
  });
});
