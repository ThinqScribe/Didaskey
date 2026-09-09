"""Adopt compatible tables created by legacy development create_all startup."""
import sqlalchemy as sa
from alembic import op


def ensure_table(name, *elements):
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(name):
        return op.create_table(name, *elements)
    expected = sa.Table(name, sa.MetaData(), *elements)
    actual = {c["name"]: c for c in inspector.get_columns(name)}
    def incompatible(detail):
        raise RuntimeError(f"Existing {name} is incompatible ({detail}); no existing data was overwritten")
    if set(actual) != set(expected.columns.keys()):
        incompatible("columns")
    for column in expected.columns:
        existing = actual[column.name]
        if existing["type"]._type_affinity is not column.type._type_affinity:
            incompatible(f"type of {column.name}")
        length = getattr(column.type, "length", None)
        if length is not None and getattr(existing["type"], "length", None) != length:
            incompatible(f"length of {column.name}")
        if existing["nullable"] != column.nullable and not column.primary_key:
            incompatible(f"nullability of {column.name}")
    if inspector.get_pk_constraint(name)["constrained_columns"] != list(expected.primary_key.columns.keys()):
        incompatible("primary key")
    uniques = {tuple(c["column_names"]) for c in inspector.get_unique_constraints(name)}
    uniques |= {tuple(i["column_names"]) for i in inspector.get_indexes(name) if i["unique"]}
    for constraint in expected.constraints:
        if isinstance(constraint, sa.UniqueConstraint) and tuple(constraint.columns.keys()) not in uniques:
            incompatible("unique constraint")
    foreign_keys = {(tuple(f["constrained_columns"]), f["referred_table"], tuple(f["referred_columns"])) for f in inspector.get_foreign_keys(name)}
    for constraint in expected.foreign_key_constraints:
        targets = [element.target_fullname.split(".") for element in constraint.elements]
        if (tuple(constraint.columns.keys()), targets[0][-2], tuple(t[-1] for t in targets)) not in foreign_keys:
            incompatible("foreign key")


def ensure_index(name, table, columns, unique=False):
    existing = next((i for i in sa.inspect(op.get_bind()).get_indexes(table) if i["name"] == name), None)
    if existing:
        if existing["column_names"] != columns or bool(existing["unique"]) != unique:
            raise RuntimeError(f"Existing index {name} is incompatible")
        return
    op.create_index(name, table, columns, unique=unique)
