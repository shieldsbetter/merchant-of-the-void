// Templated text that agrees in number with its subject. Templates are
// Mustache; on top of whatever the caller passes, they get:
//   {{They}} {{they}} {{Their}} {{their}} {{them}} {{theirs}} {{theyAre}}
//     "they" for a plural subject, "it" for a singular one
//   {{s}} {{es}}  verb endings: "rise{{s}}" → "rises" / "rise"
//   {{#number}}is|are{{/number}}  singular|plural
import Mustache from 'mustache';

Mustache.escape = (s) => s; // plain text; the client sets it with textContent

const PRONOUNS = {
    false: {
        They: 'It',
        they: 'it',
        Their: 'Its',
        their: 'its',
        them: 'it',
        theirs: 'its',
        theyAre: 'it is',
        s: 's',
        es: 'es',
    },
    true: {
        They: 'They',
        they: 'they',
        Their: 'Their',
        their: 'their',
        them: 'them',
        theirs: 'theirs',
        theyAre: 'they are',
        s: '',
        es: '',
    },
};

export const say = (template, context, plural = false) =>
    Mustache.render(template, {
        ...PRONOUNS[!!plural],
        number: () => (text, render) => render(text).split('|')[plural ? 1 : 0],
        ...context,
    });
