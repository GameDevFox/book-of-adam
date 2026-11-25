import { useState } from "react";

import { DESERET_LETTERS, LETTER_GROUPS, capital, small } from "./alphabet";

/**
 * The forty letters, as a reading primer. Built from DESERET_LETTERS — the same table the
 * converter uses — so the chart can never drift from the behaviour it documents.
 */
export const DeseretPrimer = () => {
  const [open, setOpen] = useState(false);

  return (
    <section className="deseret-primer">
      <button
        type="button"
        className="deseret-primer-toggle"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} The forty letters
      </button>

      {open && (
        <div className="deseret-primer-body">
          <p className="deseret-hint">
            Sound values are approximate and varied between writers and decades. Vowel examples use
            the standard lexical-set keywords; letter names are rarely stated outright in the
            original publications, so some are standardized or inferred.
          </p>

          {LETTER_GROUPS.map((group) => (
            <div key={group.title} className="deseret-primer-group">
              <h4>{group.title}</h4>
              {group.note && <p className="deseret-hint">{group.note}</p>}
              <table className="deseret-chart">
                <thead>
                  <tr>
                    <th>Letter</th>
                    <th>Name</th>
                    <th>Sound</th>
                    <th>As in</th>
                  </tr>
                </thead>
                <tbody>
                  {DESERET_LETTERS.slice(group.from, group.to).map((letter) => (
                    <tr key={letter.name}>
                      <td className="deseret-chart-glyphs deseret-inline">
                        {capital(letter.name)} {small(letter.name)}
                      </td>
                      <td>{letter.label}</td>
                      <td className="deseret-chart-ipa">/{letter.ipa}/</td>
                      <td className="deseret-chart-example">{letter.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
