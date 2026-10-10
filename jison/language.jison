%start program
%%
program : statements EOF { return $1; } ;
statements
    : /* empty */ { $$ = []; }
    | statements statement { $1.push($2); $$ = $1; }
    ;
statement
    : simple NEWLINE { $$ = $1; }
    | IF expression ':' suite elifs otherwise { $$ = {type: 'if', branches: [{condition: $2, body: $4}, ...$5], otherwise: $6, line: @1.first_line}; }
    | WHILE expression ':' suite { $$ = {type: 'while', condition: $2, body: $4, line: @1.first_line}; }
    | FOR NAME IN NAME '(' arguments ')' ':' suite { $$ = {type: 'for', name: $2, iterator: $4, args: $6, body: $9, line: @1.first_line}; }
    | FOR NAME IN qualified ':' suite { $$ = {type: 'for', name: $2, iterator: 'array', iterable: {type: 'name', name: $4, line: @4.first_line}, body: $6, line: @1.first_line}; }
    | DEF NAME '(' parameters ')' ':' suite { $$ = {type: 'function', name: $2, params: $4.map(p => p.name), defaults: $4.map(p => p.value), body: $7, line: @1.first_line}; }
    ;
suite : NEWLINE INDENT statements DEDENT { $$ = $3; } ;
elifs
    : /* empty */ { $$ = []; }
    | elifs ELIF expression ':' suite { $1.push({condition: $3, body: $5}); $$ = $1; }
    ;
otherwise : /* empty */ { $$ = []; } | ELSE ':' suite { $$ = $3; } ;
simple
    : HEADER '.' NAME '=' expression { $$ = {type: 'header', key: $3, expression: $5, line: @1.first_line}; }
    | qualified '=' expression { $$ = {type: 'assign', name: $1, expression: $3, line: @1.first_line}; }
    | qualified AUGMENT expression { $$ = {type: 'assign', name: $1, op: $2.slice(0, -1), expression: {type: 'binary', op: $2.slice(0, -1), left: {type: 'name', name: $1, line: @1.first_line}, right: $3, line: @1.first_line}, line: @1.first_line}; }
    | indexed '=' expression { $$ = {type: 'index_assign', target: $1, expression: $3, op: null, line: @1.first_line}; }
    | indexed AUGMENT expression { $$ = {type: 'index_assign', target: $1, expression: $3, op: $2.slice(0, -1), line: @1.first_line}; }
    | indexed_field '=' expression { $$ = {type: 'field_assign', target: $1, expression: $3, op: null, line: @1.first_line}; }
    | indexed_field AUGMENT expression { $$ = {type: 'field_assign', target: $1, expression: $3, op: $2.slice(0, -1), line: @1.first_line}; }
    | IMPORT qualified alias { $$ = {type: 'import', module: $2, alias: $3, line: @1.first_line}; }
    | FROM qualified IMPORT imported { $$ = {type: 'from', module: $2, items: $4, line: @1.first_line}; }
    | GLOBAL names { $$ = {type: 'global', names: $2, line: @1.first_line}; }
    | expression { $$ = {type: 'expression', expression: $1, line: @1.first_line}; }
    | BREAK { $$ = {type: 'break', line: @1.first_line}; }
    | CONTINUE { $$ = {type: 'continue', line: @1.first_line}; }
    | PASS { $$ = {type: 'pass', line: @1.first_line}; }
    | RETURN expression { $$ = {type: 'return', expression: $2, line: @1.first_line}; }
    | RETURN { $$ = {type: 'return', expression: {type: 'number', value: 0, line: @1.first_line}, line: @1.first_line}; }
    ;
parameters : /* empty */ { $$ = []; } | parameter_list { $$ = $1; } ;
parameter_list : parameter { $$ = [$1]; } | parameter_list ',' parameter { $1.push($3); $$ = $1; } ;
parameter : NAME { $$ = {name: $1, value: null}; } | NAME '=' expression { $$ = {name: $1, value: $3}; } ;
qualified : NAME { $$ = $1; } | qualified '.' NAME { $$ = $1 + '.' + $3; } ;
alias : /* empty */ { $$ = null; } | AS NAME { $$ = $2; } ;
imported : NAME alias { $$ = [{name: $1, alias: $2}]; } | imported ',' NAME alias { $1.push({name: $3, alias: $4}); $$ = $1; } ;
names : NAME { $$ = [$1]; } | names ',' NAME { $1.push($3); $$ = $1; } ;
arguments : /* empty */ { $$ = []; } | call_items { $$ = $1; } | call_items ',' { $$ = $1; } ;
call_items : call_item { $$ = [$1]; } | call_items ',' call_item { $1.push($3); $$ = $1; } ;
call_item : expression { $$ = $1; } | NAME '=' expression { $$ = {type: 'keyword', name: $1, expression: $3, line: @1.first_line}; } ;
expressions : expression { $$ = [$1]; } | expressions ',' expression { $1.push($3); $$ = $1; } ;
list_items : /* empty */ { $$ = []; } | expressions { $$ = $1; } | expressions ',' { $$ = $1; } ;
indexed : qualified '[' expression ']' { $$ = {type: 'index', array: {type: 'name', name: $1, line: @1.first_line}, index: $3, line: @1.first_line}; } ;
indexed_field : indexed '.' NAME { $$ = {type: 'field', object: $1, field: $3, line: @1.first_line}; } ;
expression
    : expression OR conjunction { $$ = {type: 'binary', op: 'or', left: $1, right: $3, line: @1.first_line}; }
    | conjunction { $$ = $1; }
    ;
conjunction
    : conjunction AND negation { $$ = {type: 'binary', op: 'and', left: $1, right: $3, line: @1.first_line}; }
    | negation { $$ = $1; }
    ;
negation
    : NOT negation { $$ = {type: 'unary', op: 'not', expression: $2, line: @1.first_line}; }
    | comparison { $$ = $1; }
    ;
comparison : bit_or comparisons { $$ = $2.length ? {type: 'compare', first: $1, rest: $2, line: @1.first_line} : $1; } ;
comparisons
    : /* empty */ { $$ = []; }
    | comparisons COMPARE bit_or { $1.push({op: $2, expression: $3}); $$ = $1; }
    ;
bit_or
    : bit_or '|' bit_xor { $$ = {type: 'binary', op: '|', left: $1, right: $3, line: @1.first_line}; }
    | bit_xor { $$ = $1; }
    ;
bit_xor
    : bit_xor '^' bit_and { $$ = {type: 'binary', op: '^', left: $1, right: $3, line: @1.first_line}; }
    | bit_and { $$ = $1; }
    ;
bit_and
    : bit_and '&' sum { $$ = {type: 'binary', op: '&', left: $1, right: $3, line: @1.first_line}; }
    | sum { $$ = $1; }
    ;
sum
    : sum '+' term { $$ = {type: 'binary', op: '+', left: $1, right: $3, line: @1.first_line}; }
    | sum '-' term { $$ = {type: 'binary', op: '-', left: $1, right: $3, line: @1.first_line}; }
    | term { $$ = $1; }
    ;
term
    : term '*' unary { $$ = {type: 'binary', op: '*', left: $1, right: $3, line: @1.first_line}; }
    | term '/' unary { $$ = {type: 'binary', op: '/', left: $1, right: $3, line: @1.first_line}; }
    | term FLOORDIV unary { $$ = {type: 'binary', op: '//', left: $1, right: $3, line: @1.first_line}; }
    | term '%' unary { $$ = {type: 'binary', op: '%', left: $1, right: $3, line: @1.first_line}; }
    | unary { $$ = $1; }
    ;
unary
    : '-' unary { $$ = {type: 'unary', op: '-', expression: $2, line: @1.first_line}; }
    | '+' unary { $$ = {type: 'unary', op: '+', expression: $2, line: @1.first_line}; }
    | '~' unary { $$ = {type: 'unary', op: '~', expression: $2, line: @1.first_line}; }
    | atom { $$ = $1; }
    ;
atom
    : NUMBER { $$ = {type: 'number', value: Number($1), line: @1.first_line}; }
    | DECIMAL { $$ = {type: 'decimal', value: Number($1), line: @1.first_line}; }
    | STRING { $$ = {type: 'string', value: yy.string($1), line: @1.first_line}; }
    | TRUE { $$ = {type: 'boolean', value: true, line: @1.first_line}; }
    | FALSE { $$ = {type: 'boolean', value: false, line: @1.first_line}; }
    | qualified { $$ = {type: 'name', name: $1, line: @1.first_line}; }
    | qualified '(' arguments ')' { $$ = {type: 'call', name: $1, args: $3, line: @1.first_line}; }
    | indexed { $$ = $1; }
    | indexed_field { $$ = $1; }
    | '[' list_items ']' { $$ = {type: 'list', items: $2, line: @1.first_line}; }
    | '(' expression ')' { $$ = $2; }
    ;
